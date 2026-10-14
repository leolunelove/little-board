import type { Board, Task } from "./types";
import { taskPatch, HttpError } from "./security";
import { BOARD_IMAGE_LIMIT } from "./task-images";
export function makeBackup(board: Board) {
  return {
    format: "little-board-backup",
    version: 1,
    exported_at: new Date().toISOString(),
    board: {
      title: board.title,
      description: board.description || "",
      tasks: board.tasks,
    },
  };
}
export function parseBackup(
  raw: unknown,
): Pick<Board, "title" | "description" | "tasks"> {
  const value = raw as any;
  if (
    value?.format !== "little-board-backup" ||
    value.version !== 1 ||
    !value.board
  )
    throw new HttpError(400, "Choose a Little Board backup file.");
  const board = value.board;
  if (
    typeof board.title !== "string" ||
    !board.title.trim() ||
    board.title.trim().length > 100 ||
    typeof (board.description || "") !== "string" ||
    (board.description || "").length > 200 ||
    !Array.isArray(board.tasks) ||
    board.tasks.length > 1000
  )
    throw new HttpError(400, "This backup contains invalid board details.");
  const now = new Date().toISOString();
  const date = (value: unknown) =>
    typeof value === "string" && Number.isFinite(Date.parse(value))
      ? new Date(value).toISOString()
      : now;
  const tasks: Task[] = board.tasks.map((item: any) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new HttpError(400, "This backup contains an invalid item.");
    const patch = taskPatch({
      title: item.title,
      note: item.note || "",
      status: item.status,
      assigned_to: item.assigned_to ?? null,
      ...(item.checklist !== undefined ? { checklist: item.checklist } : {}),
      ...(item.images !== undefined ? { images: item.images } : {}),
      ...(item.original_request !== undefined
        ? { original_request: item.original_request }
        : {}),
    });
    return {
      ...patch,
      id: crypto.randomUUID(),
      board_id: "",
      sort_order:
        Number.isSafeInteger(item.sort_order) && item.sort_order >= 0
          ? item.sort_order
          : 1024,
      created_at: date(item.created_at),
      updated_at: date(item.updated_at),
      completed_at: item.status === "done" ? date(item.completed_at) : null,
    } as Task;
  });
  if (
    tasks.reduce(
      (total, task) =>
        total +
        (task.images || []).reduce(
          (sum, img) => sum + img.src.length * 0.75,
          0,
        ),
      0,
    ) > BOARD_IMAGE_LIMIT
  )
    throw new HttpError(400, "This backup exceeds the board image allowance.");
  return {
    title: board.title.trim(),
    description: (board.description || "").trim(),
    tasks,
  };
}
