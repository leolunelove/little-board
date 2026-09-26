import { transport } from "./transport";
export async function memoRequest(path: string, body?: unknown) {
  const response = await transport.request(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Couldn’t connect. Please try again.");
  return data;
}
