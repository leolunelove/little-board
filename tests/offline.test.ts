import { test } from "node:test";
import assert from "node:assert/strict";
import { OfflineBoards, sameContent, type Vault } from "../lib/offline-store";
import { HttpError } from "../lib/security";
import { makeBackup, parseBackup } from "../lib/board-backup";
import { localBoards, LOCAL_KEY } from "../lib/local-boards";
import { launchTarget } from "../lib/launch";
import type { Board } from "../lib/types";
class Memory implements Vault {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async set(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }
  async all<T>() {
    return structuredClone([...this.data.values()]) as T[];
  }
  async clear() {
    this.data.clear();
  }
}
const board: Board = {
  id: "8b12e658-bb7b-4f56-9afc-799171ff50be",
  code: "123456",
  title: "Original",
  description: "Plan",
  access: "owner",
  claimed: true,
  updated_at: "2026-10-01T10:00:00Z",
  tasks: [],
};
test("offline edits are durable, user-scoped and deny viewer writes", async () => {
  const vault = new Memory();
  const store = new OfflineBoards(vault);
  await store.remember("owner", board, 4);
  const edited = await store.edit("owner", board.code!, {
    action: "rename",
    title: "Offline title",
  });
  assert.equal(edited.sync_state, "pending");
  assert.equal(
    (await new OfflineBoards(vault).get("owner", board.code!))?.board.title,
    "Offline title",
  );
  assert.equal(await store.get("other", board.code!), undefined);
  await store.remember("viewer", { ...board, access: "viewer" }, 4);
  await assert.rejects(
    store.edit("viewer", board.code!, { action: "rename", title: "Bad" }),
    /read-only/,
  );
});
test("changed remote revision keeps the device edits and never writes", async () => {
  const store = new OfflineBoards(new Memory());
  await store.remember("owner", board, 4);
  await store.edit("owner", board.code!, {
    action: "rename",
    title: "Device title",
  });
  let writes = 0;
  await store.sync(
    "owner",
    board.code!,
    async () => ({ board: { ...board, title: "Elsewhere" }, revision: 5 }),
    async () => {
      writes++;
      throw new Error();
    },
  );
  const record = await store.get("owner", board.code!);
  assert.equal(writes, 0);
  assert.equal(record?.conflict, true);
  assert.equal(record?.board.title, "Device title");
});
test("a lost response is reconciled without replaying a successful write", async () => {
  const store = new OfflineBoards(new Memory());
  await store.remember("owner", board, 4);
  await store.edit("owner", board.code!, {
    action: "rename",
    title: "Offline title",
  });
  let remote = { board, revision: 4 };
  let writes = 0;
  await assert.rejects(
    store.sync(
      "owner",
      board.code!,
      async () => remote,
      async (snapshot) => {
        remote = {
          board: { ...snapshot, updated_at: "2026-10-02T00:00:00Z" },
          revision: 5,
        };
        writes++;
        throw new TypeError("Connection lost");
      },
    ),
  );
  await store.sync(
    "owner",
    board.code!,
    async () => remote,
    async () => {
      writes++;
      return remote;
    },
  );
  assert.equal(writes, 1);
  assert.equal((await store.get("owner", board.code!))?.pending, false);
});
test("editing during an upload preserves the newer edit for the next sync", async () => {
  const store = new OfflineBoards(new Memory());
  await store.remember("owner", board, 4);
  await store.edit("owner", board.code!, { action: "rename", title: "First" });
  let release: (value: { board: Board; revision: number }) => void = () => {};
  let started: () => void = () => {};
  const waiting = new Promise<void>((resolve) => (started = resolve));
  let sent: Board | undefined;
  const upload = store.sync(
    "owner",
    board.code!,
    async () => ({ board, revision: 4 }),
    async (snapshot) => {
      sent = snapshot;
      started();
      return new Promise((resolve) => (release = resolve));
    },
  );
  await waiting;
  await store.edit("owner", board.code!, {
    action: "describe",
    description: "Edited during upload",
  });
  release({ board: sent!, revision: 5 });
  await upload;
  const row = await store.get("owner", board.code!);
  assert.equal(row?.pending, true);
  assert.equal(row?.revision, 5);
  assert.equal(row?.board.description, "Edited during upload");
  await store.sync(
    "owner",
    board.code!,
    async () => ({ board: sent!, revision: 5 }),
    async (snapshot) => ({ board: snapshot, revision: 6 }),
  );
  assert.equal((await store.get("owner", board.code!))?.pending, false);
});
test("server object key ordering does not create a false conflict", () => {
  const a = { ...board, tasks: [{ title: "Task", note: "", id: "a" } as any] };
  const b = { ...board, tasks: [{ id: "a", note: "", title: "Task" } as any] };
  assert.equal(sameContent(a, b), true);
});
test("conflicted edits can be recovered without discarding them when local storage fails", async () => {
  const store = new OfflineBoards(new Memory());
  await store.remember("owner", board, 4);
  await store.edit("owner", board.code!, {
    action: "rename",
    title: "Keep this",
  });
  await assert.rejects(
    store.recover("owner", board.code!, () => {
      throw new Error("Storage full");
    }),
  );
  assert.equal((await store.get("owner", board.code!))?.pending, true);
  const copy = await store.recover("owner", board.code!, (snapshot) => ({
    ...snapshot,
    code: "654321",
    claimed: false,
  }));
  assert.equal(copy.title, "Keep this");
  assert.equal((await store.get("owner", board.code!))?.pending, false);
});
test("restore makes a new local board, retains images and archive dates, and excludes sharing credentials", () => {
  const storage = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  const source = {
    ...board,
    invited_email: "viewer@example.com",
    tasks: [
      {
        id: crypto.randomUUID(),
        board_id: board.id,
        title: "Old done item",
        note: "Reference",
        status: "done",
        assigned_to: null,
        sort_order: 1024,
        created_at: board.updated_at,
        updated_at: board.updated_at,
        completed_at: board.updated_at,
        checklist: [{ id: crypto.randomUUID(), title: "Step", done: true }],
        images: [
          {
            id: crypto.randomUUID(),
            name: "Reference",
            src: "data:image/webp;base64,UklGRg==",
          },
        ],
      },
    ],
  } as Board;
  const backup = makeBackup(source);
  const restored = localBoards(() => adapter).restore(backup);
  assert.notEqual(restored.id, source.id);
  assert.notEqual(restored.tasks[0].id, source.tasks[0].id);
  assert.equal(restored.tasks[0].board_id, restored.id);
  assert.equal(
    restored.tasks[0].completed_at,
    new Date(board.updated_at).toISOString(),
  );
  assert.deepEqual(restored.tasks[0].images, source.tasks[0].images);
  assert.equal(restored.claimed, false);
  assert.equal(restored.invited_email, undefined);
  assert.ok(storage.has(LOCAL_KEY));
  assert.throws(() => parseBackup({ ...backup, version: 3 }));
  assert.throws(() =>
    parseBackup({ ...backup, board: { ...backup.board, tasks: [null] } }),
  );
});
test("launch preferences keep only valid board routes", () => {
  assert.equal(launchTarget("last", "123456"), "123456");
  assert.equal(launchTarget("all", "123456"), "all");
  assert.equal(launchTarget("home", "123456"), undefined);
  assert.equal(launchTarget("last", "https://other.example"), undefined);
});

test("a successful permission refresh removes revoked cached boards and preserves pending recovery", async () => {
  const store = new OfflineBoards(new Memory());
  await store.remember("owner", board, 1);
  const second = { ...board, code: "234567", id: crypto.randomUUID() };
  await store.remember("owner", second, 1);
  await store.edit("owner", second.code, {
    action: "rename",
    title: "Keep my edits",
  });
  await store.prune("owner", [], (_code, fn) => fn());
  assert.equal(await store.get("owner", board.code!), undefined);
  const pending = await store.get("owner", second.code);
  assert(pending?.pending && pending.conflict);
  assert.equal(pending.board.title, "Keep my edits");
  await assert.rejects(
    store.edit("owner", second.code, { action: "rename", title: "Denied" }),
    { status: 403 },
  );
});

test("a duplicate sync rejection cannot turn an acknowledged save into an unrecoverable conflict", async () => {
  const store = new OfflineBoards(new Memory());
  await store.remember("owner", board, 1);
  await store.edit("owner", board.code!, {
    action: "rename",
    title: "Saved once",
  });
  const first = store.sync(
    "owner",
    board.code!,
    async () => ({ board, revision: 1 }),
    async (copy) => {
      return { board: copy, revision: 2 };
    },
  );
  const duplicate = store.sync(
    "owner",
    board.code!,
    async () => ({ board, revision: 1 }),
    async () => {
      await first;
      throw new HttpError(409, "Already written");
    },
  );
  await first;
  await duplicate.catch(() => {});
  const row = await store.get("owner", board.code!);
  assert.equal(row?.pending, false);
  assert.equal(row?.conflict, false);
  assert.equal(row?.board.title, "Saved once");
});
