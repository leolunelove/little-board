"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, ChevronDown } from "lucide-react";
import type { Board, Task, Status } from "@/lib/types";
import { transport } from "@/lib/transport";
import { memoRequest } from "@/lib/client-api";
import { boardList } from "@/lib/board-list";
import { boardUrl, navigate } from "@/lib/navigation";
import { TaskRow } from "./memo-board";
import { TaskEditor } from "./task-editor";
import { useMemoMutations } from "./use-memo-mutations";
import { useSessionDraft } from "./use-session-draft";
import { useComposerDock } from "./use-composer-dock";
import { AppearanceControl } from "./appearance-control";

const labels = { pending: "Pending", waiting: "Waiting", done: "Done" };
const statuses: Status[] = ["pending", "waiting", "done"];
export function combineBoards(boards: Board[]): Board {
  return {
    id: "all-items",
    title: "All items",
    updated_at:
      boards
        .map((b) => b.updated_at)
        .sort()
        .at(-1) || new Date().toISOString(),
    tasks: boards.flatMap((b) => b.tasks),
  };
}
// Resolve every edit to its original board; never write an aggregate board.
export function sourceBoard(
  boards: Board[],
  command: Record<string, any>,
): Board {
  const board =
    command.action === "add"
      ? boards.find((b) => b.id === command.task?.board_id)
      : boards.find((b) => b.tasks.some((task) => task.id === command.id));
  if (!board?.code || board.access === "viewer")
    throw new Error("You can only edit boards you own.");
  if (!["add", "update", "delete"].includes(command.action))
    throw new Error("Open the board to reorder its items.");
  return board;
}

export function AllItems({
  initial,
  initialWarning = "",
}: {
  initial: Board[];
  initialWarning?: string;
}) {
  const boardsRef = useRef(initial);
  const [boards, setBoards] = useState(initial);
  const [refreshError, setRefreshError] = useState(initialWarning);
  const [now, setNow] = useState(Date.now());
  const [preferences, remember] = useSessionDraft("memo:all-view:v1", {
    filter: "",
    query: "",
    scroll: 0,
    done: false,
  });
  const savedScroll = useRef(preferences.scroll);
  const [filter, setFilter] = useState(preferences.filter);
  const [query, setQuery] = useState(preferences.query);
  const [doneOpen, setDoneOpen] = useState(preferences.done);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useSessionDraft<Record<string, Partial<Task>>>(
    "memo:draft:v1:all:edits",
    {},
  );
  const [addDraft, setAddDraft] = useSessionDraft<Partial<Task> | null>(
    "memo:draft:v1:all:add",
    null,
  );
  const [adding, setAdding] = useState(Boolean(addDraft));
  const [addDirty, setAddDirty] = useState(Boolean(addDraft));
  const [destination, setDestination] = useState(addDraft?.board_id || "");
  const destinationRef = useRef(destination);
  destinationRef.current = destination;
  const [expandedNotes, setExpandedNotes] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const publish = useCallback((next: Board[]) => {
    boardsRef.current = next;
    setBoards(next);
  }, []);
  const request = useCallback<typeof transport.request>(
    async (_url, options) => {
      try {
        if (options?.method === "POST") {
          const command = JSON.parse(String(options.body));
          const source = sourceBoard(boardsRef.current, command);
          const response = await transport.request(
            `/api/memos/${source.code}`,
            options,
          );
          if (!response.ok) return response;
          const saved: Board = await response.json();
          const next = boardsRef.current.map((board) =>
            board.id === saved.id ? saved : board,
          );
          publish(next);
          return Response.json(combineBoards(next));
        }
        const info = await memoRequest("/api/memos");
        if (info.warning) throw new Error(info.warning);
        publish(info.boards);
        return Response.json(combineBoards(info.boards));
      } catch (error) {
        return Response.json(
          { error: (error as Error).message },
          { status: 503 },
        );
      }
    },
    [publish],
  );
  const {
    board,
    setBoard,
    busy,
    error,
    setError,
    canRetry,
    retryLast,
    change,
    complete,
    remove,
    undo,
    undoLast,
    hiddenTaskId,
    settleUndo,
    inFlight,
    revision,
  } = useMemoMutations(combineBoards(initial), false, request);
  const owners = boards.filter((b) => b.access !== "viewer");
  const locked = busy || Boolean(editing) || addDirty;
  const { dockRef, style } = useComposerDock(
    Boolean(owners.length) && !editing,
    adding,
  );
  useEffect(() => {
    window.scrollTo?.(0, savedScroll.current);
  }, []);
  useEffect(() => {
    const save = () =>
      remember({ filter, query, done: doneOpen, scroll: window.scrollY });
    save();
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, [filter, query, doneOpen, remember]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let stopped = false;
    let refreshing = false;
    const refresh = async () => {
      if (
        document.hidden ||
        inFlight.current ||
        editing ||
        addDirty ||
        refreshing
      )
        return;
      refreshing = true;
      const version = revision.current;
      const token = ++generation.current;
      try {
        const info = await memoRequest("/api/memos");
        if (info.warning) throw new Error(info.warning);
        if (
          !stopped &&
          token === generation.current &&
          !inFlight.current &&
          version === revision.current
        ) {
          publish(info.boards);
          setBoard(combineBoards(info.boards));
          setRefreshError("");
        }
      } catch {
        if (!stopped)
          setRefreshError("Couldn’t refresh. Showing the last loaded items.");
      } finally {
        refreshing = false;
      }
    };
    const tick = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 8000);
    const visible = () => {
      if (!document.hidden) {
        setNow(Date.now());
        void refresh();
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "little-board:guests:v1") void refresh();
    };
    window.addEventListener("focus", visible);
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", storage);
    return () => {
      stopped = true;
      generation.current++;
      clearInterval(tick);
      window.removeEventListener("focus", visible);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", storage);
    };
  }, [editing, addDirty, inFlight, revision, publish, setBoard]);
  const rememberDraft = useCallback(
    (id: string, value: Partial<Task> | null) =>
      setDrafts((current) => {
        const next = { ...current };
        if (value) next[id] = value;
        else delete next[id];
        return next;
      }),
    [setDrafts],
  );
  const rememberAdd = useCallback(
    (id: string, value: Partial<Task> | null) =>
      setAddDraft(
        value ? { ...value, id, board_id: destinationRef.current } : null,
      ),
    [setAddDraft],
  );
  async function leave(code?: string) {
    if (!(await settleUndo())) return;
    remember({ filter, query, scroll: window.scrollY, done: doneOpen });
    if (code) {
      window.history.pushState(null, "", `${boardUrl(code)}?from=all`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.scrollTo?.(0, 0);
    } else navigate();
  }
  async function update(task: Task, patch: Partial<Task>, fromEditor = false) {
    const transform = (current: Board) => ({
      ...current,
      tasks: current.tasks.map((row) =>
        row.id === task.id
          ? {
              ...row,
              ...patch,
              completed_at:
                patch.status && patch.status !== row.status
                  ? patch.status === "done"
                    ? new Date().toISOString()
                    : null
                  : row.completed_at,
            }
          : row,
      ),
    });
    const ok =
      patch.status && patch.status !== task.status
        ? await complete(
            task,
            "update",
            { id: task.id, patch },
            transform,
            fromEditor,
            patch.status === "done" ? "complete" : "move",
          )
        : await change("update", { id: task.id, patch }, transform, fromEditor);
    if (ok && fromEditor) {
      rememberDraft(task.id, null);
      setEditing(null);
    }
    return ok;
  }
  const visible = boardList(
    board.tasks,
    now,
    false,
    hiddenTaskId,
    query,
  ).filter((task) => !filter || task.board_id === filter);
  const filterMissing = filter && !boards.some((board) => board.id === filter);
  return (
    <main
      className={`memo-shell all-items-shell${owners.length ? " has-quick-add" : ""}`}
      style={style}
    >
      <nav className="personal-topbar" aria-label="All items navigation">
        <button
          className="text-button"
          disabled={locked}
          onClick={() => void leave()}
        >
          ‹ Your boards
        </button>
        <span className="quiet-label">little board.</span>
      </nav>
      <header className="memo-header">
        <h1>All items</h1>
        <p className="updated" role="status">
          {busy
            ? "Saving…"
            : error
              ? "Not saved · please retry"
              : refreshError
                ? refreshError
                : "Across your boards · updates automatically"}
        </p>
      </header>
      <div className="all-items-filters">
        <label>
          <span className="sr-only">Show board</span>
          <select
            aria-label="Show board"
            value={filter}
            disabled={locked}
            onChange={(event) => {
              setFilter(event.target.value);
              setQuery("");
            }}
          >
            <option value="">All boards</option>
            {filterMissing && <option value={filter}>Board unavailable</option>}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {b.code}
                {b.access === "viewer" ? " · View only" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="all-items-search">
          <Search size={16} />
          <input
            type="search"
            aria-label="Find across boards"
            placeholder="Find an item…"
            value={query}
            disabled={Boolean(editing)}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          {canRetry && !editing && !adding && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void retryLast()}
            >
              Retry save
            </button>
          )}
        </div>
      )}
      {!boards.length && (
        <p className="section-empty">
          Your items will appear here when you create a board.{" "}
          <button className="text-button" onClick={() => void leave()}>
            Go to your boards
          </button>
        </p>
      )}
      {Boolean(boards.length) && !visible.length && (
        <p className="section-empty">
          {query.trim()
            ? "No matching items. Try another word."
            : filterMissing
              ? "This board is no longer available. Choose another board."
              : "Nothing pending. A little breathing room."}
        </p>
      )}
      {statuses.map((status) => {
        const tasks = visible.filter((task) => task.status === status);
        if (!tasks.length) return null;
        return (
          <section
            className={`task-section section-${status}`}
            aria-label={labels[status]}
            key={status}
          >
            <div className="section-heading">
              {status === "done" ? (
                <button
                  className="collapse-button"
                  disabled={Boolean(editing) || busy}
                  aria-expanded={doneOpen || Boolean(query.trim())}
                  onClick={() => setDoneOpen(!doneOpen)}
                >
                  <ChevronDown size={14} />
                  <h2>Done</h2>
                </button>
              ) : (
                <h2>{labels[status]}</h2>
              )}
              <span className="section-count">{tasks.length}</span>
            </div>
            {(status !== "done" || doneOpen || query.trim()) &&
              tasks.map((task) => {
                const source = boards.find((b) => b.id === task.board_id);
                if (!source) return null;
                const writable = source.access !== "viewer";
                return (
                  <TaskRow
                    key={`${source.id}:${task.id}`}
                    task={task}
                    personal
                    list={false}
                    hideDrag
                    sourceLabel={
                      <button
                        className="source-board-link"
                        disabled={locked}
                        onClick={() => void leave(source.code)}
                      >
                        {source.title}{" "}
                        <span className="source-board-number">
                          {source.code}
                        </span>
                        {writable ? "" : " · View only"}{" "}
                        <span aria-hidden="true">↗</span>
                      </button>
                    }
                    initiallyOpen={Boolean(query.trim())}
                    writable={writable}
                    busy={busy}
                    draft={writable ? drafts[task.id] : undefined}
                    onDraftChange={rememberDraft}
                    expanded={
                      expandedNotes.includes(task.id) || Boolean(query.trim())
                    }
                    onToggleNote={() =>
                      setExpandedNotes((current) =>
                        current.includes(task.id)
                          ? current.filter((id) => id !== task.id)
                          : [...current, task.id],
                      )
                    }
                    dragDisabled
                    dragActive={false}
                    reducedMotion={false}
                    canMoveUp={false}
                    canMoveDown={false}
                    dropBefore={false}
                    editing={editing === task.id}
                    onEdit={() => setEditing(task.id)}
                    onCancel={() => {
                      rememberDraft(task.id, null);
                      setEditing(null);
                      setError("");
                    }}
                    onSave={(patch, fromEditor) =>
                      update(task, patch, fromEditor)
                    }
                    onDelete={() => void remove(task)}
                    onMove={() => {}}
                  />
                );
              })}
          </section>
        );
      })}
      {owners.length > 0 && (
        <div className="add-area" ref={dockRef} hidden={Boolean(editing)}>
          {adding ? (
            <>
              <label className="add-destination">
                Add to{" "}
                <select
                  aria-label="Add to board"
                  value={destination}
                  disabled={busy}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    if (addDraft)
                      setAddDraft({
                        ...addDraft,
                        board_id: event.target.value,
                      });
                  }}
                >
                  <option value="" disabled>
                    Choose a board
                  </option>
                  {owners.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} · {b.code}
                    </option>
                  ))}
                </select>
              </label>
              <TaskEditor
                personal
                draft={addDraft || undefined}
                draftId={addDraft?.id}
                busy={busy}
                onDraftChange={rememberAdd}
                onDirtyChange={setAddDirty}
                onCancel={() => {
                  setAdding(false);
                  setAddDirty(false);
                  setAddDraft(null);
                }}
                onSave={async (patch, id) => {
                  const source = owners.find((b) => b.id === destination);
                  if (!source) {
                    setError("Choose an available board first.");
                    return false;
                  }
                  const stamp = new Date().toISOString();
                  const task: Task = {
                    id,
                    board_id: source.id,
                    title: patch.title!,
                    note: patch.note || "",
                    checklist: patch.checklist,
                    assigned_to: patch.assigned_to || null,
                    status: patch.status || "pending",
                    sort_order:
                      Math.max(
                        0,
                        ...source.tasks.map((task) => task.sort_order),
                      ) + 1024,
                    created_at: stamp,
                    updated_at: stamp,
                    completed_at: patch.status === "done" ? stamp : null,
                  };
                  const ok = await change("add", { task }, (current) => ({
                    ...current,
                    tasks: [...current.tasks, task],
                  }));
                  if (ok) {
                    setNotice(`Added to ${source.title}`);
                    setQuery("");
                    if (filter && filter !== source.id) setFilter(source.id);
                    if (task.status === "done") setDoneOpen(true);
                  }
                  return ok;
                }}
              />
            </>
          ) : (
            <button
              className="add-button"
              disabled={busy}
              onClick={() => {
                setDestination(
                  owners.find((b) => b.id === filter)?.id || owners[0].id,
                );
                setAdding(true);
              }}
            >
              <Plus size={20} />
              Add item
            </button>
          )}
        </div>
      )}
      <footer className="memo-footer">
        <span>Each item stays on its original board.</span>
        <AppearanceControl />
      </footer>
      {undo && (
        <div className="toast undo-toast" role="status">
          <span>
            {undo.committing
              ? "Removing…"
              : undo.kind === "delete"
                ? "Item removed"
                : undo.kind === "move"
                  ? "Item moved"
                  : "Item completed"}
          </span>
          <button
            disabled={busy || Boolean(undo.committing)}
            onClick={() => {
              setNotice("");
              void undoLast();
            }}
          >
            Undo
          </button>
        </div>
      )}
      {notice && !undo && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}
