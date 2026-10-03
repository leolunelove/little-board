export type RequestSuggestion = { heading: string; items: string[] };

// Intentionally conservative: recognise written lists, never invent instructions.
export function splitRequest(text: string): RequestSuggestion {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const marker = /^(?:[-*•–—]\s+|\d+[.)]\s+|\[[ xX]\]\s+|[☐☑]\s*)/;
  const hasList = lines.some((line) => marker.test(line));
  let heading = "";
  const items: string[] = [];
  for (const line of lines) {
    if (!marker.test(line) && line.endsWith(":") && !heading && !items.length) {
      heading = line.slice(0, -1).trim();
      continue;
    }
    // Introductory prose stays in the original request, rather than becoming a task.
    if (hasList && !marker.test(line)) {
      if (items.length && !line.endsWith(":"))
        items[items.length - 1] += ` ${line}`;
      continue;
    }
    const value = line
      .replace(marker, "")
      .replace(/^\[[ xX]\]\s*/, "")
      .trim();
    if (value) items.push(value);
  }
  if (!items.length && text.trim()) items.push(text.trim());
  return { heading, items };
}
