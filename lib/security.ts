export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assertOrigin(request: Request, origin: string) {
  if (request.headers.get("origin") !== new URL(origin).origin)
    throw new HttpError(403, "Request not allowed.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "Use JSON.");
}
export function title(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 240)
    throw new HttpError(400, "Use an item title between 1 and 240 characters.");
  return value.trim();
}
export function taskPatch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "Invalid item.");
  const v = value as Record<string, unknown>,
    out: Record<string, unknown> = {};
  for (const key of Object.keys(v))
    if (!["title", "note", "status", "assigned_to"].includes(key))
      throw new HttpError(400, "Unsupported field.");
  if ("title" in v) out.title = title(v.title);
  if ("note" in v) {
    if (typeof v.note !== "string" || v.note.length > 400)
      throw new HttpError(400, "Keep notes under 400 characters.");
    out.note = v.note.trim();
  }
  if ("status" in v) {
    if (!["pending", "waiting", "done"].includes(String(v.status)))
      throw new HttpError(400, "Invalid status.");
    out.status = v.status;
  }
  if ("assigned_to" in v) {
    if (
      v.assigned_to !== null &&
      v.assigned_to !== "me" &&
      v.assigned_to !== "partner"
    )
      throw new HttpError(400, "Invalid assignee.");
    out.assigned_to = v.assigned_to;
  }
  if (!Object.keys(out).length)
    throw new HttpError(400, "No changes supplied.");
  return out;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new HttpError(400, "Invalid item.");
  return value;
}
