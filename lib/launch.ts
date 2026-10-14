import { CODE } from "./navigation";
export const LAUNCH_KEY = "little-board:launch";
export const LAST_BOARD_KEY = "little-board:last-board";
export type LaunchChoice = "last" | "home" | "all";
export function launchTarget(choice: unknown, last: unknown) {
  if (choice === "all") return "all";
  if (choice !== "home" && typeof last === "string" && CODE.test(last))
    return last;
  return undefined;
}
export function readLaunch(): LaunchChoice {
  try {
    const value = localStorage.getItem(LAUNCH_KEY);
    return value === "home" || value === "all" ? value : "last";
  } catch {
    return "last";
  }
}
