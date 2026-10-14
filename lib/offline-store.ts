import type { Board } from "./types";
import { applyCommand } from "./local-boards";
import { HttpError } from "./security";
export type Identity = { id: string; email: string };
export type OfflineRecord = {
  uid: string;
  code: string;
  board: Board;
  base: Board;
  revision: number;
  pending: boolean;
  conflict: boolean;
  generation: number;
  attempt?: { board: Board; generation: number };
};
export interface Vault {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  all<T>(): Promise<T[]>;
  clear(): Promise<void>;
}
let database: Promise<IDBDatabase> | undefined;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("little-board-offline", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("records");
      request.onerror = () => {
        database = undefined;
        reject(new Error("Allow device storage to work offline."));
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
    });
  return database;
}
export const browserVault: Vault = {
  async get<T>(key: string) {
    const db = await open();
    return new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction("records").objectStore("records").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async set(key, value) {
    const db = await open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            "Couldn’t save on this device. Export a backup and free some storage.",
          ),
        );
      tx.onabort = () => reject(tx.error);
    });
  },
  async all<T>() {
    const db = await open();
    return new Promise<T[]>((resolve, reject) => {
      const req = db.transaction("records").objectStore("records").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  async clear() {
    const db = await open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
export const sameContent = (a: Board, b: Board) =>
  canonical([a.title, a.description || "", a.tasks]) ===
  canonical([b.title, b.description || "", b.tasks]);
const key = (uid: string, code: string) => `board:${uid}:${code}`;
export class OfflineBoards {
  constructor(public vault: Vault = browserVault) {}
  identity() {
    return this.vault.get<Identity>("identity");
  }
  setIdentity(identity: Identity) {
    return this.vault.set("identity", identity);
  }
  async records(uid: string) {
    return (await this.vault.all<OfflineRecord>()).filter(
      (row) => row?.uid === uid && row.code,
    );
  }
  async prune(
    uid: string,
    allowed: string[],
    guard: <T>(code: string, fn: () => Promise<T>) => Promise<T>,
  ) {
    for (const old of await this.records(uid))
      if (!allowed.includes(old.code))
        await guard(old.code, async () => {
          const row = await this.get(uid, old.code);
          if (!row) return;
          if (row.pending) {
            row.conflict = true;
            row.board.access = "viewer";
            await this.put(row);
          } else await this.vault.set(key(uid, old.code), undefined);
        });
  }
  get(uid: string, code: string) {
    return this.vault.get<OfflineRecord>(key(uid, code));
  }
  async remember(uid: string, board: Board, revision: number) {
    const current = await this.get(uid, board.code!);
    if (current?.pending) {
      current.board.access = board.access;
      if (board.access !== "owner") {
        current.conflict = true;
        await this.put(current);
      }
      return this.view(current);
    }
    const record: OfflineRecord = {
      uid,
      code: board.code!,
      board,
      base: board,
      revision,
      pending: false,
      conflict: false,
      generation: current?.generation || 0,
    };
    await this.put(record);
    return this.view(record);
  }
  view(record: OfflineRecord): Board {
    return {
      ...record.board,
      sync_state: record.conflict
        ? "conflict"
        : record.pending
          ? "pending"
          : "synced",
    };
  }
  put(record: OfflineRecord) {
    return this.vault.set(key(record.uid, record.code), record);
  }
  async edit(uid: string, code: string, command: unknown) {
    const record = await this.get(uid, code);
    if (!record)
      throw new HttpError(
        503,
        "Open this board online once before editing offline.",
      );
    if (record.board.access !== "owner")
      throw new HttpError(403, "This shared board is read-only.");
    record.board = applyCommand(record.board, command);
    record.pending = true;
    record.generation++;
    await this.put(record);
    return this.view(record);
  }
  async sync(
    uid: string,
    code: string,
    read: () => Promise<{ board: Board; revision: number }>,
    write: (
      board: Board,
      revision: number,
    ) => Promise<{ board: Board; revision: number }>,
    guard: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn(),
  ) {
    const initial = await this.get(uid, code);
    if (!initial?.pending || initial.conflict) return;
    const remote = await read();
    const attempt = await guard(async () => {
      const record = await this.get(uid, code);
      if (!record?.pending || record.conflict) return;
      if (remote.board.access !== "owner") {
        record.conflict = true;
        record.board.access = remote.board.access;
        await this.put(record);
        return;
      }
      if (record.attempt && sameContent(remote.board, record.attempt.board)) {
        record.revision = remote.revision;
        record.base = remote.board;
        if (record.generation === record.attempt.generation) {
          record.board = remote.board;
          record.pending = false;
          delete record.attempt;
          await this.put(record);
          return;
        }
        delete record.attempt;
      }
      if (remote.revision !== record.revision) {
        record.conflict = true;
        await this.put(record);
        return;
      }
      record.attempt = {
        board: structuredClone(record.board),
        generation: record.generation,
      };
      await this.put(record);
      return {
        board: record.attempt.board,
        generation: record.generation,
        revision: record.revision,
      };
    });
    if (!attempt) return;
    try {
      const saved = await write(attempt.board, attempt.revision);
      await guard(async () => {
        const record = await this.get(uid, code);
        if (!record?.pending || record.revision > saved.revision) return;
        record.base = saved.board;
        record.revision = saved.revision;
        if (record.generation === attempt.generation) {
          record.board = saved.board;
          record.pending = false;
        }
        delete record.attempt;
        await this.put(record);
      });
    } catch (e) {
      if (e instanceof HttpError && [403, 409].includes(e.status))
        await guard(async () => {
          const record = await this.get(uid, code);
          if (record?.pending) {
            record.conflict = true;
            await this.put(record);
          }
        });
      throw e;
    }
  }
  async recover(uid: string, code: string, saveCopy: (board: Board) => Board) {
    const record = await this.get(uid, code);
    if (!record?.pending)
      throw new HttpError(400, "There are no pending changes to recover.");
    const copy = saveCopy(record.board);
    record.board = record.base;
    record.pending = false;
    record.conflict = false;
    delete record.attempt;
    await this.put(record);
    return copy;
  }
}
export const offlineBoards = new OfflineBoards();
