"use client";
import { useEffect, useRef, useState } from "react";
import type { Board } from "@/lib/types";
import { currentCode, navigate } from "@/lib/navigation";
import { LAUNCH_KEY, readLaunch, type LaunchChoice } from "@/lib/launch";
import { memoRequest } from "@/lib/client-api";
import { makeBackup } from "@/lib/board-backup";
export function AppTools({ boardId }: { boardId?: string }) {
  const [launch, setLaunch] = useState<LaunchChoice>("last");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<
    { code: string; title: string; conflict: boolean }[]
  >([]);
  const [pwa, setPwa] = useState({
    install: false,
    update: false,
    offlineReady: false,
  });
  const [help, setHelp] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setLaunch(readLaunch());
    let stopped = false;
    const refresh = () =>
      void memoRequest("/api/offline")
        .then((rows) => {
          if (!stopped) setPending(rows);
        })
        .catch(() => {});
    const state = (event: Event) =>
      setPwa((current) => ({ ...current, ...(event as CustomEvent).detail }));
    window.addEventListener("little-board:sync", refresh);
    window.addEventListener("little-board:pwa", state);
    window.dispatchEvent(new Event("little-board:pwa-status"));
    refresh();
    return () => {
      stopped = true;
      window.removeEventListener("little-board:sync", refresh);
      window.removeEventListener("little-board:pwa", state);
    };
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-tools">
      <h3>When the app opens</h3>
      <select
        aria-label="App opening page"
        value={launch}
        onChange={(event) => {
          const next = event.target.value as LaunchChoice;
          try {
            localStorage.setItem(LAUNCH_KEY, next);
            setLaunch(next);
          } catch {
            setError("Allow browser storage to remember this choice.");
          }
        }}
      >
        <option value="last">Last board</option>
        <option value="home">Your boards</option>
        <option value="all">All items</option>
      </select>
      <p className="attachment-hint">
        Used when launching the installed app. Board links still open their own
        board.
      </p>
      <h3>Install Little Board</h3>
      <button
        className="text-button"
        onClick={() =>
          pwa.install
            ? window.dispatchEvent(new Event("little-board:install"))
            : setHelp(!help)
        }
      >
        {pwa.install ? "Install app" : "How to install"}
      </button>
      {help && (
        <p className="settings-copy">
          On iPhone, open Little Board in Safari, choose Share → Add to Home
          Screen, and enable Open as Web App if offered. On Android or desktop,
          use your browser’s Install app option. No app-store download is
          needed.
        </p>
      )}
      {pwa.offlineReady && (
        <p className="attachment-hint">
          The app is ready to open offline. Open a saved board online once to
          keep a device copy.
        </p>
      )}
      {pwa.update && (
        <button
          className="text-button"
          onClick={() => window.dispatchEvent(new Event("little-board:update"))}
        >
          Reload latest app version
        </button>
      )}
      <h3>Backups</h3>
      {boardId && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const code = currentCode();
              if (!code) return;
              const board: Board = await memoRequest(`/api/memos/${code}`);
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(makeBackup(board), null, 2)], {
                  type: "application/json",
                }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `little-board-${code}-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setMessage("Backup downloaded with saved items and images.");
            })
          }
        >
          Download this board
        </button>
      )}
      <button
        className="text-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        Restore a board
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Choose board backup"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void action(async () => {
            if (file.size > 6 * 1024 * 1024)
              throw new Error("Choose a backup under 6 MB.");
            let raw;
            try {
              raw = JSON.parse(await file.text());
            } catch {
              throw new Error("This isn’t a readable JSON backup.");
            }
            const restored: Board = await memoRequest("/api/backup", raw);
            navigate(restored.code);
          });
        }}
      />
      <p className="attachment-hint">
        Includes saved items, notes, checklists and images. Restore makes a new
        board on this device; the original stays intact.
      </p>
      {pending.length > 0 && (
        <>
          <h3>Changes on this device</h3>
          {pending.map((row) => (
            <div className="pending-board" key={row.code}>
              <strong>{row.title}</strong>
              <p>
                {row.conflict
                  ? "This board changed elsewhere. Keep your edits as a separate board to review them safely."
                  : "Your edits are saved here and will sync when the app is open and connected."}
              </p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const copy: Board = await memoRequest("/api/offline", {
                      action: "recover",
                      code: row.code,
                    });
                    navigate(copy.code);
                  })
                }
              >
                Keep a local copy
              </button>
            </div>
          ))}
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                setPending(
                  await memoRequest("/api/offline", { action: "retry" }),
                );
              })
            }
          >
            Try syncing now
          </button>
        </>
      )}
      {error && (
        <p className="draft-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="attachment-hint">
          {message}
        </p>
      )}
    </div>
  );
}
