import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRequest } from "../lib/paste-request";
import { applyCommand, localBoards } from "../lib/local-boards";
import { taskPatch } from "../lib/security";
import type { Board } from "../lib/types";
const stamp = "2026-10-03T10:00:00.000Z";
const id = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";
const step = "33333333-3333-4333-8333-333333333333";
const board: Board = { id, title: "Menu", tasks: [], updated_at: stamp };

test("pasted numbered and bullet lists preserve the client's wording and heading", () => {
  assert.deepEqual(
    splitRequest(
      "Menu changes:\n1. Update prices\n2) Replace photo\n• Export PDF",
    ),
    {
      heading: "Menu changes",
      items: ["Update prices", "Replace photo", "Export PDF"],
    },
  );
  assert.deepEqual(
    splitRequest(
      "Hi, can you do these?\n- Update prices\n  to match the new menu\n- [ ] Export PDF",
    ),
    {
      heading: "",
      items: ["Update prices to match the new menu", "Export PDF"],
    },
  );
  assert.deepEqual(splitRequest("Change photo\n\nExport PDF"), {
    heading: "",
    items: ["Change photo", "Export PDF"],
  });
  assert.deepEqual(splitRequest(""), { heading: "", items: [] });
});
test("paste imports are atomic, retry-safe, and survive local reopening with checklist progress", () => {
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  const local = localBoards(() => storage),
    created = local.create(id);
  const input = {
    action: "add_many",
    tasks: [
      {
        id,
        title: "Menu revisions",
        checklist: [{ id: step, title: "Update prices", done: false }],
        original_request: "Please update the prices.",
      },
      { id: second, title: "Send PDF" },
    ],
  };
  const result = local.change(created.code!, input);
  assert.equal(result.tasks.length, 2);
  assert.ok(result.tasks[1].sort_order > result.tasks[0].sort_order);
  assert.equal(local.change(created.code!, input).tasks.length, 2);
  local.change(created.code!, {
    action: "update",
    id,
    patch: { checklist: [{ id: step, title: "Update prices", done: true }] },
  });
  const reopened = localBoards(() => storage).get(created.code!)!;
  assert.equal(reopened.tasks[0].checklist![0].done, true);
  assert.equal(reopened.tasks[0].status, "pending");
  assert.equal(reopened.tasks[0].original_request, "Please update the prices.");
  assert.throws(
    () =>
      applyCommand(board, {
        action: "add_many",
        tasks: [
          { id, title: "Valid" },
          { id: second, title: "" },
        ],
      }),
    /title/,
  );
  assert.equal(board.tasks.length, 0);
});
test("checklists and batch imports reject excessive, malformed, and duplicate entries", () => {
  assert.throws(
    () => taskPatch({ checklist: [{ id: step, title: "Test", done: "yes" }] }),
    /Invalid checklist/,
  );
  assert.throws(
    () =>
      taskPatch({
        checklist: [
          { id: step, title: "Test", done: false },
          { id: step, title: "Test", done: false },
        ],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      taskPatch({
        checklist: Array.from({ length: 21 }, () => ({
          id: step,
          title: "Test",
          done: false,
        })),
      }),
    /20/,
  );
  assert.throws(
    () => taskPatch({ original_request: "x".repeat(4001) }),
    /4,000/,
  );
  assert.throws(
    () =>
      applyCommand(board, {
        action: "add_many",
        tasks: [
          { id, title: "A" },
          { id, title: "B" },
        ],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      applyCommand(board, {
        action: "add_many",
        tasks: Array.from({ length: 21 }, () => ({ id, title: "A" })),
      }),
    /20/,
  );
});
