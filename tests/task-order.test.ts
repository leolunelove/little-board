import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOrder, planMove, rowDestination } from "../lib/task-order";
import { memoCollision } from "../components/memo-drag";
import type { Task, Status } from "../lib/types";

const now = Date.now();
const stamp = new Date(now).toISOString();
const item = (
  id: string,
  sort_order: number,
  status: Status = "pending",
): Task => ({
  id,
  board_id: "board",
  title: id,
  note: "",
  status,
  assigned_to: null,
  sort_order,
  created_at: stamp,
  updated_at: stamp,
  completed_at: status === "done" ? stamp : null,
});
const tasks = [
  item("a", 0),
  item("b", 1024),
  item("c", 2048),
  item("w", 0, "waiting"),
];
const order = (changes: ReturnType<typeof planMove>) =>
  changes?.map((task) => task.id);

test("drop positions are explicit before/after for both upward and downward moves", () => {
  const beforeC = rowDestination(tasks, "a", "c", false, now)!;
  const afterC = rowDestination(tasks, "a", "c", true, now)!;
  assert.deepEqual(order(planMove(tasks, "a", beforeC, now)), ["b", "a", "c"]);
  assert.deepEqual(order(planMove(tasks, "a", afterC, now)), ["b", "c", "a"]);
  assert.deepEqual(
    order(
      planMove(tasks, "c", rowDestination(tasks, "c", "a", false, now)!, now),
    ),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    order(
      planMove(tasks, "c", rowDestination(tasks, "c", "a", true, now)!, now),
    ),
    ["a", "c", "b"],
  );
});

test("cross-section and empty-section drops preserve unrelated and archived tasks", () => {
  const archived = {
    ...item("old", 1024, "done"),
    completed_at: new Date(now - 25 * 3600000).toISOString(),
  };
  const all = [...tasks, archived];
  const moved = planMove(all, "a", { status: "done", beforeId: null }, now)!;
  assert.deepEqual(moved, [{ id: "a", status: "done", sort_order: 0 }]);
  const changed = applyOrder(
    { id: "board", title: "Memo", updated_at: stamp, tasks: all },
    moved,
    stamp,
  );
  assert.equal(
    changed.tasks.find((task) => task.id === "a")?.completed_at,
    stamp,
  );
  assert.deepEqual(
    changed.tasks.find((task) => task.id === "old"),
    archived,
  );
  assert.deepEqual(
    changed.tasks.find((task) => task.id === "w"),
    tasks[3],
  );
  const waiting = planMove(
    tasks,
    "a",
    { status: "waiting", beforeId: "w" },
    now,
  )!;
  assert.deepEqual(order(waiting), ["a", "w"]);
  assert.ok(waiting.every((task) => task.status === "waiting"));
});

test("unchanged, invalid and hidden targets do not submit reorders", () => {
  assert.equal(
    planMove(tasks, "a", { status: "pending", beforeId: "b" }, now),
    null,
  );
  assert.equal(
    planMove(tasks, "c", { status: "pending", beforeId: null }, now),
    null,
  );
  assert.equal(
    planMove(tasks, "a", { status: "pending", beforeId: "missing" }, now),
    null,
  );
  assert.equal(
    planMove(tasks, "a", { status: "waiting", beforeId: null }, now, "a"),
    null,
  );
  assert.equal(rowDestination(tasks, "a", "b", true, now, "b"), null);
});

test("sorting Done never resets its archive clock; reopening clears completion", () => {
  const done = [item("d1", 0, "done"), item("d2", 1024, "done")];
  const board = { id: "board", title: "Memo", updated_at: stamp, tasks: done };
  const later = new Date(now + 60000).toISOString();
  const sorted = applyOrder(
    board,
    planMove(done, "d2", { status: "done", beforeId: "d1" }, now)!,
    later,
  );
  assert.ok(sorted.tasks.every((task) => task.completed_at === stamp));
  const reopened = applyOrder(
    board,
    planMove(done, "d1", { status: "pending", beforeId: null }, now)!,
    later,
  );
  assert.equal(reopened.tasks[0].completed_at, null);
});

test("pointer collisions prefer a row over its section and cancel outside the board", () => {
  const rect = {
    left: 0,
    top: 0,
    right: 500,
    bottom: 300,
    width: 500,
    height: 300,
  };
  const row = { ...rect, top: 60, bottom: 120, height: 60 };
  const container = (
    id: string,
    kind: string,
    count: number,
    bounds: typeof rect,
  ) => ({
    id,
    key: id,
    disabled: false,
    node: { current: null },
    rect: { current: bounds },
    data: { current: { kind, count } },
  });
  const args = {
    active: {
      id: "active",
      data: { current: {} },
      rect: { current: { initial: row, translated: row } },
    },
    collisionRect: row,
    droppableRects: new Map([
      ["pending", rect],
      ["b", row],
    ]),
    droppableContainers: [
      container("pending", "section", 1, rect),
      container("b", "task", 0, row),
    ],
    pointerCoordinates: { x: 100, y: 90 },
  };
  assert.equal(memoCollision(args)[0].id, "b");
  assert.deepEqual(
    memoCollision({ ...args, pointerCoordinates: { x: 900, y: 900 } }),
    [],
  );
  assert.equal(
    memoCollision({ ...args, pointerCoordinates: { x: 100, y: 20 } })[0].id,
    "pending",
  );
});
