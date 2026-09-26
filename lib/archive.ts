import type { Task } from "./types";
export const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;
export function isArchived(
  task: Pick<Task, "status" | "completed_at">,
  now = Date.now(),
) {
  return (
    task.status === "done" &&
    task.completed_at !== null &&
    new Date(task.completed_at).getTime() <= now - ARCHIVE_AFTER_MS
  );
}
