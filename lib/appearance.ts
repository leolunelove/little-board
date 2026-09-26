export type Appearance = "light" | "night";
export const APPEARANCE_KEY = "memo:appearance";
export const APPEARANCE_COLORS = { light: "#f3f6fa", night: "#121821" };

export function validAppearance(value: unknown): Appearance | null {
  return value === "light" || value === "night" ? value : null;
}

export function savedAppearance(): Appearance | null {
  try {
    return validAppearance(localStorage.getItem(APPEARANCE_KEY));
  } catch {
    return null;
  }
}

export function applyAppearance(appearance: Appearance) {
  document.documentElement.dataset.theme = appearance;
  document.documentElement.style.colorScheme =
    appearance === "night" ? "dark" : "light";
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) =>
      meta.setAttribute("content", APPEARANCE_COLORS[appearance]),
    );
}

// Runs in the document head before hydration, so a saved night preference does
// not briefly paint a light page. The script contains no user-provided values.
export const APPEARANCE_SCRIPT = `(()=>{let choice;try{choice=localStorage.getItem("${APPEARANCE_KEY}")}catch{}const theme=choice==="light"||choice==="night"?choice:window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"night":"light";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme==="night"?"dark":"light";const colors=${JSON.stringify(APPEARANCE_COLORS)};document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute("content",colors[theme]));})();`;
