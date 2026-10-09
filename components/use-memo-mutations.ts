"use client";
import { transport } from "@/lib/transport";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, Task } from "@/lib/types";

export const UNDO_MS = 8000;
type Undo = {
  kind: "delete" | "complete" | "move";
  previousOrder?: { id: string; status: Task["status"]; sort_order: number }[];
  task: Task;
  expiresAt: number;
  committing?: Promise<boolean>;
};
type Transform = (board: Board) => Board;

export function useMemoMutations(
  initial: Board,
  demo: boolean,
  request = transport.request,
) {
  const writePath = initial.code ? `/api/memos/${initial.code}` : "/api/tasks";
  const readPath = initial.code ? `/api/memos/${initial.code}` : "/api/board";
  const [board, setBoardState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failedChange, setFailedChange] = useState<{
    action: string;
    payload: Record<string, unknown>;
    optimistic?: Transform;
    defer: boolean;
  } | null>(null);
  const [undo, setUndoState] = useState<Undo | null>(null);
  const boardRef = useRef(initial);
  const undoRef = useRef<Undo | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const queue = useRef(Promise.resolve(true));
  const undoQueue = useRef(Promise.resolve(true));
  const queued = useRef(0);
  const inFlight = useRef(false);
  const revision = useRef(0);

  const setBoard = useCallback((next: Board) => {
    boardRef.current = next;
    if (mounted.current) setBoardState(next);
  }, []);
  const clearUndo = useCallback((entry?: Undo) => {
    if (entry && undoRef.current !== entry) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    undoRef.current = null;
    if (mounted.current) setUndoState(null);
  }, []);

  const change = useCallback(
    (
      action: string,
      payload: Record<string, unknown>,
      optimistic?: Transform,
      defer = false,
    ) => {
      queued.current++;
      inFlight.current = true;
      revision.current++;
      if (mounted.current) {
        setBusy(true);
        setError("");
        setFailedChange(null);
      }
      const execute = async () => {
        const before = boardRef.current;
        if (optimistic && !defer)
          setBoard({
            ...optimistic(before),
            updated_at: new Date().toISOString(),
          });
        try {
          if (!demo) {
            const response = await request(writePath, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action, ...payload }),
            });
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error || "Couldn’t save. Please try again.");
            setBoard(data);
          } else if (optimistic && defer)
            setBoard({
              ...optimistic(before),
              updated_at: new Date().toISOString(),
            });
          return true;
        } catch (e) {
          // A lost response can follow a successful add/delete. Reconcile by the
          // existing task UUID before retrying, so quick-add never creates a twin.
          if (
            !demo &&
            (action === "add" || action === "add_many" || action === "delete")
          ) {
            try {
              const response = await request(readPath, {
                cache: "no-store",
              });
              if (response.ok) {
                const current: Board = await response.json();
                const expected = payload.task as Task | undefined;
                const saved = current.tasks.find(
                  (task) => task.id === (expected?.id || payload.id),
                );
                const equivalent = (saved: Task | undefined, expected: Task) =>
                  Boolean(
                    saved &&
                    [
                      "title",
                      "note",
                      "status",
                      "assigned_to",
                      "checklist",
                      "original_request",
                    ].every(
                      (key) =>
                        JSON.stringify(saved[key as keyof Task]) ===
                        JSON.stringify(expected[key as keyof Task]),
                    ),
                  );
                if (
                  (action === "add_many" &&
                    (payload.tasks as Task[]).every((expected) =>
                      equivalent(
                        current.tasks.find((task) => task.id === expected.id),
                        expected,
                      ),
                    )) ||
                  (action === "delete" && !saved) ||
                  (action === "add" && expected && equivalent(saved, expected))
                ) {
                  setBoard(current);
                  return true;
                }
              }
            } catch {
              /* Keep the draft when the connection is still unavailable. */
            }
          }
          setBoard(before);
          if (mounted.current)
            setFailedChange({ action, payload, optimistic, defer });
          if (mounted.current)
            setError(
              e instanceof TypeError
                ? "Couldn’t connect. Please try again."
                : (e as Error).message,
            );
          return false;
        } finally {
          queued.current--;
          inFlight.current = queued.current > 0;
          if (mounted.current) setBusy(inFlight.current);
        }
      };
      const result = queue.current.then(execute, execute);
      queue.current = result;
      return result;
    },
    [demo, setBoard, writePath, readPath, request],
  );

  const commitDeletion = useCallback(
    (entry: Undo) => {
      if (entry.committing) return entry.committing;
      if (timer.current) clearTimeout(timer.current);
      entry.committing = change("delete", { id: entry.task.id }, (current) => ({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== entry.task.id),
      })).then((ok) => {
        clearUndo(entry);
        return ok;
      });
      if (mounted.current) setUndoState({ ...entry });
      return entry.committing;
    },
    [change, clearUndo],
  );

  const settleUndo = useCallback(async () => {
    const previous = undoRef.current;
    if (previous?.kind === "delete") return commitDeletion(previous);
    clearUndo();
    return true;
  }, [clearUndo, commitDeletion]);

  const armUndo = useCallback(
    (kind: Undo["kind"], task: Task, previousOrder?: Undo["previousOrder"]) => {
      const entry: Undo = {
        kind,
        task,
        previousOrder,
        expiresAt: Date.now() + UNDO_MS,
      };
      undoRef.current = entry;
      if (mounted.current) setUndoState(entry);
      timer.current = setTimeout(() => {
        if (kind === "delete") void commitDeletion(entry);
        else clearUndo(entry);
      }, UNDO_MS);
    },
    [clearUndo, commitDeletion],
  );

  const remove = useCallback(
    async (task: Task) => {
      const result = undoQueue.current.then(async () => {
        if (!(await settleUndo())) return false;
        armUndo("delete", task);
        return true;
      });
      undoQueue.current = result;
      return result;
    },
    [armUndo, settleUndo],
  );

  const complete = useCallback(
    async (
      task: Task,
      action: string,
      payload: Record<string, unknown>,
      optimistic?: Transform,
      defer = false,
      kind: "complete" | "move" = "complete",
    ) => {
      const result = undoQueue.current.then(async () => {
        if (!(await settleUndo())) return false;
        const items = payload.items as { id: string }[] | undefined;
        const previousOrder = items
          ? boardRef.current.tasks
              .filter((item) => items.some((move) => move.id === item.id))
              .map(({ id, status, sort_order }) => ({ id, status, sort_order }))
          : undefined;
        const ok = await change(action, payload, optimistic, defer);
        if (ok) armUndo(kind, task, previousOrder);
        return ok;
      });
      undoQueue.current = result;
      return result;
    },
    [armUndo, change, settleUndo],
  );

  const undoLast = useCallback(async () => {
    const entry = undoRef.current;
    if (!entry || entry.committing) return;
    if (Date.now() >= entry.expiresAt) {
      if (entry.kind === "delete") await commitDeletion(entry);
      else clearUndo(entry);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    if (entry.kind === "delete") {
      clearUndo(entry);
      return;
    }
    const ok = await change(
      entry.previousOrder ? "reorder" : "update",
      entry.previousOrder
        ? { items: entry.previousOrder }
        : { id: entry.task.id, patch: { status: entry.task.status } },
      (current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          entry.previousOrder?.find((item) => item.id === task.id)
            ? {
                ...task,
                ...entry.previousOrder.find((item) => item.id === task.id)!,
                completed_at:
                  task.id === entry.task.id
                    ? entry.task.completed_at
                    : task.completed_at,
              }
            : task.id === entry.task.id
              ? {
                  ...task,
                  status: entry.task.status,
                  completed_at: entry.task.completed_at,
                }
              : task,
        ),
      }),
    );
    if (ok) clearUndo(entry);
    else {
      entry.expiresAt = Date.now() + UNDO_MS;
      if (mounted.current) setUndoState({ ...entry });
      timer.current = setTimeout(() => clearUndo(entry), UNDO_MS);
    }
  }, [change, clearUndo, commitDeletion]);

  useEffect(() => {
    mounted.current = true;
    const flush = () => {
      const entry = undoRef.current;
      if (entry?.kind !== "delete") return;
      undoRef.current = null;
      if (mounted.current) setUndoState(null);
      if (timer.current) clearTimeout(timer.current);
      if (!demo)
        void request(writePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id: entry.task.id }),
          keepalive: true,
        }).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      mounted.current = false;
      window.removeEventListener("pagehide", flush);
      flush();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [demo, writePath, request]);

  return {
    board,
    setBoard,
    busy,
    error,
    setError,
    canRetry: Boolean(failedChange),
    retryLast: () =>
      failedChange
        ? change(
            failedChange.action,
            failedChange.payload,
            failedChange.optimistic,
            failedChange.defer,
          )
        : Promise.resolve(false),
    inFlight,
    revision,
    change,
    undo,
    hiddenTaskId: undo?.kind === "delete" ? undo.task.id : null,
    remove,
    complete,
    undoLast,
    settleUndo,
  };
}
