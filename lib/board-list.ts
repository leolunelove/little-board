import type { Task } from "./types";
import { isArchived } from "./archive";

const order = { pending: 0, waiting: 1, done: 2 };
const labels = { pending: "Pending", waiting: "Waiting", done: "Done" };
export function boardList(
  tasks: Task[],
  now: number,
  archived = false,
  hiddenId?: string | null,
  query = "",
) {
  const term = query.trim().toLocaleLowerCase();
  return tasks
    .filter(
      (task) =>
        task.id !== hiddenId &&
        isArchived(task, now) === archived &&
        [
          task.title,
          task.note,
          ...(task.checklist || []).map((step) => step.title),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(term),
    )
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        a.sort_order - b.sort_order ||
        a.id.localeCompare(b.id),
    );
}
export function formatBoardList(title: string, tasks: Task[]) {
  return [
    title,
    "",
    ...tasks.flatMap((task) => [
      `${task.status === "done" ? "✓" : task.status === "waiting" ? "◌" : "○"} ${task.title} [${labels[task.status]}]${task.assigned_to ? ` · ${task.assigned_to === "me" ? "Owner" : "Partner"}` : ""}`,
      ...(task.note ? task.note.split("\n").map((line) => `  ${line}`) : []),
      ...(task.checklist || []).map(
        (step) => `  ${step.done ? "[x]" : "[ ]"} ${step.title}`,
      ),
      "",
    ]),
  ]
    .join("\n")
    .trim();
}
