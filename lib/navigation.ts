export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const CODE = /^[1-9][0-9]{5}$/;
export function boardUrl(code?: string) {
  return `${basePath}/${code || ""}`;
}
export function navigate(code?: string) {
  window.history.pushState(null, "", boardUrl(code));
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo?.(0, 0);
}
export function currentCode() {
  const value = window.location.pathname
    .slice(basePath.length)
    .replace(/^\/+|\/+$/g, "");
  return CODE.test(value) ? value : null;
}
