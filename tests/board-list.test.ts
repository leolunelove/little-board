import { test } from "node:test";
import assert from "node:assert/strict";
import { boardList, formatBoardList } from "../lib/board-list";
import type { Task } from "../lib/types";
const now = Date.now();
const base: Task = {
  id: "a",
  board_id: "b",
  title: "First",
  note: "",
  status: "pending",
  assigned_to: null,
  sort_order: 0,
  created_at: new Date(now).toISOString(),
  updated_at: new Date(now).toISOString(),
  completed_at: null,
};
test("compiled list sorts statuses, hides archived and staged deletions, searches steps", () => {
  const tasks: Task[] = [
    {
      ...base,
      id: "done",
      status: "done",
      completed_at: new Date(now).toISOString(),
    },
    { ...base, id: "waiting", status: "waiting" },
    { ...base, id: "later", sort_order: 200 },
    base,
    {
      ...base,
      id: "old",
      status: "done",
      completed_at: new Date(now - 25 * 3600000).toISOString(),
    },
    { ...base, id: "hidden" },
  ];
  assert.deepEqual(
    boardList(tasks, now, false, "hidden").map((t) => t.id),
    ["a", "later", "waiting", "done"],
  );
  assert.deepEqual(
    boardList(tasks, now, true).map((t) => t.id),
    ["old"],
  );
  assert.equal(
    boardList(
      [
        {
          ...base,
          checklist: [{ id: "step", title: "Print PDF", done: false }],
        },
      ],
      now,
      false,
      null,
      " PDF ",
    ).length,
    1,
  );
});
test("copy text preserves notes, checklist progress and statuses without original client messages", () => {
  const text = formatBoardList("Menu", [
    {
      ...base,
      note: "Two lines\nOf context",
      checklist: [{ id: "s", title: "Export PDF", done: true }],
      original_request: "Not part of the list",
    },
  ]);
  assert.match(text, /○ First \[Pending\]/);
  assert.match(text, /  Two lines\n  Of context/);
  assert.match(text, /\[x\] Export PDF/);
  assert.ok(!text.includes("Not part of the list"));
});
