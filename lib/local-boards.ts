import type { Board, Task } from "./types";
import { taskCommand } from "./task-command";
import { HttpError, uuid } from "./security";
import { CODE } from "./navigation";

export const LOCAL_KEY = "little-board:guests:v1";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export function randomCode() {
  return String(
    100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
  );
}
export function applyCommand(
  board: Board,
  input: unknown,
  now = new Date().toISOString(),
): Board {
  const command = taskCommand(input) as {
    action: string;
    title?: string;
    id?: string;
    task?: Task;
    tasks?: Task[];
    patch?: Partial<Task>;
    items?: Pick<Task, "id" | "status" | "sort_order">[];
  };
  const next = structuredClone(board);
  if (command.action === "rename") next.title = command.title!;
  if (command.action === "add" || command.action === "add_many") {
    const additions = (
      command.action === "add" ? [command.task!] : command.tasks!
    ).filter((item) => !next.tasks.some((task) => task.id === item.id));
    if (next.tasks.length + additions.length > 1000)
      throw new HttpError(400, "This board has reached 1,000 items.");
    if (!additions.length) return next;
    for (const task of additions) {
      next.tasks.push({
        ...task,
        board_id: board.id,
        sort_order: Math.max(0, ...next.tasks.map((t) => t.sort_order)) + 1024,
        created_at: now,
        updated_at: now,
        completed_at: task.status === "done" ? now : null,
      });
    }
  }
  if (command.action === "delete")
    next.tasks = next.tasks.filter((t) => t.id !== command.id);
  if (command.action === "update" || command.action === "reorder") {
    const patches =
      command.action === "update"
        ? [{ id: command.id!, ...command.patch }]
        : command.items!;
    for (const patch of patches) {
      const task = next.tasks.find((t) => t.id === patch.id);
      if (!task)
        throw new HttpError(400, "This item is no longer on the board.");
      const previous = task.status;
      Object.assign(task, patch, { updated_at: now });
      if (task.status !== "done") task.completed_at = null;
      else if (previous !== "done") task.completed_at = now;
    }
  }
  next.updated_at = now;
  return next;
}
export function localBoards(storage: () => StorageLike) {
  function all(): Board[] {
    let raw: string | null;
    try {
      raw = storage().getItem(LOCAL_KEY);
    } catch {
      throw new HttpError(
        503,
        "Allow browser storage to save a board on this device.",
      );
    }
    if (!raw) return [];
    try {
      const value = JSON.parse(raw);
      if (
        !Array.isArray(value) ||
        value.some(
          (b) => !CODE.test(b.code) || !b.id || !Array.isArray(b.tasks),
        )
      )
        throw Error();
      return value;
    } catch {
      throw new HttpError(
        503,
        "The saved boards couldn’t be read. Please keep your browser data and try again.",
      );
    }
  }
  function write(boards: Board[]) {
    try {
      storage().setItem(LOCAL_KEY, JSON.stringify(boards));
    } catch {
      throw new HttpError(
        503,
        "Couldn’t save on this device. Free some browser storage and try again.",
      );
    }
  }
  function get(code: string) {
    return all().find((b) => b.code === code) || null;
  }
  return {
    list: all,
    get,
    create(id = crypto.randomUUID()) {
      uuid(id);
      const boards = all(),
        existing = boards.find((b) => b.id === id);
      if (existing) return existing;
      if (boards.length >= 100)
        throw new HttpError(400, "You have 100 boards saved on this device.");
      let code = randomCode();
      while (boards.some((b) => b.code === code)) code = randomCode();
      const board: Board = {
        id,
        code,
        title: "Untitled board",
        tasks: [],
        access: "owner",
        claimed: false,
        updated_at: new Date().toISOString(),
      };
      write([board, ...boards]);
      return board;
    },
    change(code: string, command: unknown) {
      const boards = all(),
        index = boards.findIndex((b) => b.code === code);
      if (index < 0)
        throw new HttpError(404, "This board isn’t saved in this browser.");
      boards[index] = applyCommand(boards[index], command);
      write(boards);
      return boards[index];
    },
    remove(code: string) {
      write(all().filter((b) => b.code !== code));
    },
  };
}
