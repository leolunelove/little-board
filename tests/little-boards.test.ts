import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { localBoards, LOCAL_KEY } from "../lib/local-boards";
import { isArchived } from "../lib/archive";
import { magicRedirect, normalizedEmail } from "../lib/cloud";
const owner = "11111111-1111-4111-8111-111111111111",
  viewer = "22222222-2222-4222-8222-222222222222",
  outsider = "33333333-3333-4333-8333-333333333333",
  unverified = "44444444-4444-4444-8444-444444444444";
const boardId = "55555555-5555-4555-8555-555555555555",
  taskId = "66666666-6666-4666-8666-666666666666";
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
test("guest board starts empty, is idempotent, and survives reopening with edits and ordering", () => {
  const store = storage();
  const local = localBoards(() => store);
  const board = local.create(boardId);
  assert.deepEqual(board.tasks, []);
  assert.match(board.code!, /^[1-9][0-9]{5}$/);
  assert.equal(local.create(boardId).code, board.code);
  assert.equal(local.list().length, 1);
  local.change(board.code!, { action: "rename", title: "Weekend" });
  local.change(board.code!, {
    action: "add",
    task: {
      id: taskId,
      title: "Book lunch",
      note: "By the sea",
      status: "pending",
      assigned_to: "me",
    },
  });
  local.change(board.code!, {
    action: "update",
    id: taskId,
    patch: { status: "done" },
  });
  const done = local.get(board.code!)!.tasks[0];
  assert.ok(done.completed_at);
  local.change(board.code!, {
    action: "reorder",
    items: [{ id: taskId, status: "done", sort_order: 500 }],
  });
  const reopened = localBoards(() => store).get(board.code!)!;
  assert.equal(reopened.title, "Weekend");
  assert.equal(reopened.tasks[0].completed_at, done.completed_at);
  assert.equal(
    isArchived(done, new Date(done.completed_at!).getTime() + 86400001),
    true,
  );
  local.change(board.code!, {
    action: "update",
    id: taskId,
    patch: { status: "pending" },
  });
  assert.equal(local.get(board.code!)!.tasks[0].completed_at, null);
  local.change(board.code!, { action: "delete", id: taskId });
  assert.equal(local.get(board.code!)!.tasks.length, 0);
});
test("storage failures and damaged data never silently discard a board", () => {
  const store = storage();
  store.setItem(LOCAL_KEY, "not JSON");
  assert.throws(
    () => localBoards(() => store).create(boardId),
    /couldn’t be read/,
  );
  assert.equal(store.getItem(LOCAL_KEY), "not JSON");
  const full = {
    getItem: () => null,
    setItem: () => {
      throw Error("quota");
    },
  };
  assert.throws(() => localBoards(() => full).create(boardId), /Couldn’t save/);
});
test("commands cannot inject ownership or reference another board's task", () => {
  const store = storage(),
    local = localBoards(() => store),
    board = local.create(boardId);
  assert.throws(
    () =>
      local.change(board.code!, {
        action: "update",
        id: taskId,
        patch: { owner_id: viewer },
      }),
    /Unsupported/,
  );
  assert.throws(
    () =>
      local.change(board.code!, {
        action: "reorder",
        items: [{ id: taskId, status: "pending", sort_order: 0 }],
      }),
    /no longer/,
  );
  assert.equal(local.get(board.code!)!.tasks.length, 0);
});
test("magic links return to this app and only carry validated board numbers", () => {
  assert.equal(normalizedEmail(" Person@Example.com "), "person@example.com");
  assert.throws(() => normalizedEmail("not email"));
  assert.equal(
    magicRedirect("https://example.com", "123456"),
    "https://example.com/?welcome=1&board=123456",
  );
  assert.equal(
    magicRedirect("https://example.com", "https://bad.example"),
    "https://example.com/?welcome=1",
  );
});
test("PostgreSQL allows verified owners, gives invited viewers read-only access, and rejects outsiders", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_little_board.sql", import.meta.url),
        "utf8",
      ),
    );
    const helper = await db.query<{ schema_name: string }>(
      "select n.nspname as schema_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname='verified_email'",
    );
    assert.equal(helper.rows[0].schema_name, "little_private");
    await db.query(
      "insert into auth.users values ($1,'owner@example.com',now()),($2,'viewer@example.com',now()),($3,'other@example.com',now()),($4,'unverified@example.com',null)",
      [owner, viewer, outsider, unverified],
    );
    async function as(uid: string) {
      await db.exec(
        `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`,
      );
    }
    await as(owner);
    await db.query(
      "insert into little_boards(id,code,owner_id,title,tasks) values ($1,'123456',$2,'Weekend','[]')",
      [boardId, owner],
    );
    await db.exec(
      "update little_boards set viewer_email='viewer@example.com',revision=revision+1",
    );
    assert.equal(
      (await db.query("select * from little_boards")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("update little_boards set owner_id=$1", [viewer]),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("update little_boards set tasks='{}'"),
      /Invalid items/,
    );
    const item = {
      id: taskId,
      board_id: boardId,
      title: "Lunch",
      note: "",
      status: "pending",
      assigned_to: null,
      sort_order: 1024,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    await db.query("update little_boards set tasks=$1", [
      JSON.stringify([item]),
    ]);
    await assert.rejects(
      db.query("update little_boards set tasks=$1", [
        JSON.stringify([item, item]),
      ]),
      /Duplicate/,
    );
    await assert.rejects(
      db.query("update little_boards set tasks=$1", [
        JSON.stringify([{ ...item, board_id: owner }]),
      ]),
      /Invalid board/,
    );
    await as(viewer);
    assert.equal(
      (await db.query("select * from little_boards")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("update little_boards set title='Bad' returning id")).rows
        .length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into little_boards(id,code,owner_id,title) values ($1,'234567',$2,'Bad')",
        [outsider, owner],
      ),
      /row-level security/,
    );
    await as(outsider);
    assert.equal(
      (await db.query("select * from little_boards")).rows.length,
      0,
    );
    await as(unverified);
    assert.equal(
      (await db.query("select * from little_boards")).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into little_boards(id,code,owner_id,title) values ($1,'234567',$2,'Bad')",
        [outsider, unverified],
      ),
      /row-level security/,
    );
    await as(owner);
    await db.exec("update little_boards set viewer_email=null");
    await as(viewer);
    assert.equal(
      (await db.query("select * from little_boards")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.exec("select little_private.verified_email()"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("select * from little_boards"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("update little_boards set title='Bad'"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
