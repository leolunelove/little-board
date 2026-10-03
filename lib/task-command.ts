import { HttpError, taskPatch, uuid } from "./security";
export function taskCommand(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "Invalid change.");
  const body = input as Record<string, unknown>;
  let command: Record<string, unknown>;
  if (body.action === "add" || body.action === "add_many") {
    const values = body.action === "add" ? [body.task] : body.tasks;
    if (!Array.isArray(values) || !values.length || values.length > 20)
      throw new HttpError(400, "Add between 1 and 20 items at a time.");
    const tasks = values.map((input: unknown) => {
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new HttpError(400, "Invalid item.");
      const value = input as Record<string, unknown>;
      return {
        ...taskPatch({
          title: value.title,
          note: value.note || "",
          status: value.status || "pending",
          assigned_to: value.assigned_to ?? null,
          ...(value.checklist !== undefined
            ? { checklist: value.checklist }
            : {}),
          ...(value.original_request !== undefined
            ? { original_request: value.original_request }
            : {}),
        }),
        id: uuid(value.id),
      };
    });
    if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
      throw new HttpError(400, "Duplicate item.");
    command =
      body.action === "add"
        ? { action: "add", task: tasks[0] }
        : { action: "add_many", tasks };
  } else if (body.action === "rename") {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 100
    )
      throw new HttpError(400, "Use a title between 1 and 100 characters.");
    command = { action: "rename", title: body.title.trim() };
  } else if (body.action === "update") {
    command = {
      action: "update",
      id: uuid(body.id),
      patch: taskPatch(body.patch),
    };
  } else if (body.action === "delete") {
    command = { action: "delete", id: uuid(body.id) };
  } else if (body.action === "reorder") {
    if (
      !Array.isArray(body.items) ||
      !body.items.length ||
      body.items.length > 200
    )
      throw new HttpError(400, "Invalid order.");
    const items = body.items.map((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new HttpError(400, "Invalid order.");
      const item = value as Record<string, unknown>;
      const id = uuid(item.id);
      if (
        !["pending", "waiting", "done"].includes(String(item.status)) ||
        !Number.isSafeInteger(item.sort_order) ||
        Number(item.sort_order) < 0
      )
        throw new HttpError(400, "Invalid order.");
      return { id, status: item.status, sort_order: item.sort_order };
    });
    if (new Set(items.map((t: { id: string }) => t.id)).size !== items.length)
      throw new HttpError(400, "Duplicate item.");
    command = { action: "reorder", items };
  } else throw new HttpError(400, "Unknown action.");
  return command;
}
