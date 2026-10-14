import { account, cloudRead, cloudReplace } from "./cloud";
import { offlineBoards } from "./offline-store";
import { HttpError } from "./security";
export async function boardLock<T>(
  code: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(`little-board:${code}`, fn)
    : fn();
}
let flushing = false;
export function syncEvent() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("little-board:sync"));
}
export async function rememberedUser() {
  if (navigator.onLine === false)
    return offlineBoards.identity().catch(() => undefined);
  try {
    const user = await account();
    if (user?.email) {
      await offlineBoards
        .setIdentity({ id: user.id, email: user.email })
        .catch(() => {});
      return { id: user.id, email: user.email };
    }
    return undefined;
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) throw e;
    return offlineBoards.identity().catch(() => undefined);
  }
}
export async function flushOffline() {
  if (flushing || navigator.onLine === false) return;
  flushing = true;
  try {
    const user = await account();
    if (!user?.email) return;
    await offlineBoards
      .setIdentity({ id: user.id, email: user.email })
      .catch(() => {});
    const synchronize = async () => {
      for (const record of await offlineBoards.records(user.id))
        if (record.pending && !record.conflict) {
          try {
            await offlineBoards.sync(
              user.id,
              record.code,
              () => cloudRead(record.code),
              (board, revision) => cloudReplace(board, revision),
              (fn) => boardLock(record.code, fn),
            );
          } catch {
          } finally {
            syncEvent();
          }
        }
    };
    if (navigator.locks)
      await navigator.locks.request(
        "little-board:sync",
        { ifAvailable: true },
        (lock) => (lock ? synchronize() : undefined),
      );
    else await synchronize();
  } catch {
  } finally {
    flushing = false;
  }
}
