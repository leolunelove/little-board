"use client";
import { useEffect, useState } from "react";
import type { Board } from "@/lib/types";
import { offlineBoards } from "@/lib/offline-store";
export function SaveStatus({
  board,
  busy,
  error,
  fresh = true,
}: {
  board: Board;
  busy: boolean;
  error: string;
  fresh?: boolean;
}) {
  const [state, setState] = useState(board.sync_state);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let stopped = false;
    const read = async () => {
      setOnline(navigator.onLine !== false);
      setState(board.sync_state);
      if (board.claimed && board.code) {
        const user = await offlineBoards.identity().catch(() => undefined);
        const row = user
          ? await offlineBoards.get(user.id, board.code).catch(() => undefined)
          : undefined;
        if (!stopped && row)
          setState(
            row.conflict ? "conflict" : row.pending ? "pending" : "synced",
          );
      }
    };
    void read();
    window.addEventListener("little-board:sync", read);
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      stopped = true;
      window.removeEventListener("little-board:sync", read);
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, [board.code, board.claimed, board.sync_state]);
  const text = busy
    ? "Saving…"
    : error
      ? "Not saved · please retry"
      : state === "conflict"
        ? "Saved on device · review changes in Settings"
        : state === "pending"
          ? "Saved on device · waiting to sync"
          : !board.claimed
            ? "Saved on this device"
            : !online || board.offline || !fresh
              ? "Offline copy · last synced"
              : board.access === "viewer"
                ? "Read-only · updated"
                : "Saved to your email";
  return (
    <>
      <span
        className={`sync-dot ${state === "pending" ? "sync-pending" : state === "conflict" ? "sync-conflict" : ""}`}
      />
      {text}
      <span className="save-time">
        {" "}
        ·{" "}
        {new Date(board.updated_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    </>
  );
}
