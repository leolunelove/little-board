import { isArchived } from "./archive";
import type { Board, Status, Task } from "./types";

export type DropTarget = { status: Status; beforeId: string | null };
export type OrderChange = { id: string; status: Status; sort_order: number };

export function activeTasks(
  tasks: Task[],
  status: Status,
  now: number,
  hiddenId?: string | null,
) {
  return tasks
    .filter(
      (task) =>
        task.status === status &&
        task.id !== hiddenId &&
        !isArchived(task, now),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export function rowDestination(
  tasks: Task[],
  activeId: string,
  targetId: string,
  after: boolean,
  now: number,
  hiddenId?: string | null,
): DropTarget | null {
  const target = tasks.find((task) => task.id === targetId);
  if (
    !target ||
    activeId === targetId ||
    targetId === hiddenId ||
    isArchived(target, now)
  )
    return null;
  const group = activeTasks(tasks, target.status, now, hiddenId).filter(
    (task) => task.id !== activeId,
  );
  const index = group.findIndex((task) => task.id === targetId);
  return {
    status: target.status,
    beforeId: after ? (group[index + 1]?.id ?? null) : targetId,
  };
}

export function planMove(
  tasks: Task[],
  id: string,
  destination: DropTarget,
  now: number,
  hiddenId?: string | null,
): OrderChange[] | null {
  const task = tasks.find((task) => task.id === id);
  if (!task || id === hiddenId || isArchived(task, now)) return null;
  const original = activeTasks(tasks, destination.status, now, hiddenId);
  const ordered = original.filter((item) => item.id !== id);
  const at =
    destination.beforeId === null
      ? ordered.length
      : ordered.findIndex((item) => item.id === destination.beforeId);
  if (at < 0) return null;
  ordered.splice(at, 0, task);
  if (
    task.status === destination.status &&
    ordered.every((item, index) => item.id === original[index]?.id)
  )
    return null;
  return ordered.map((item, index) => ({
    id: item.id,
    status: destination.status,
    sort_order: index * 1024,
  }));
}

export function applyOrder(
  board: Board,
  changes: OrderChange[],
  completedAt: string,
): Board {
  const byId = new Map(changes.map((change) => [change.id, change]));
  return {
    ...board,
    tasks: board.tasks.map((task) => {
      const change = byId.get(task.id);
      return change
        ? {
            ...task,
            ...change,
            completed_at:
              change.status === task.status
                ? task.completed_at
                : change.status === "done"
                  ? completedAt
                  : null,
          }
        : task;
    }),
  };
}
