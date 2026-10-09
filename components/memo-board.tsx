"use client";
import { transport } from "@/lib/transport";
import { navigate } from "@/lib/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  getClientRect,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragMoveEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  Check,
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Plus,
  Share2,
  X,
  Link2,
  ArrowUp,
  ArrowDown,
  Trash2,
  LogOut,
  Eye,
  EyeOff,
  ClipboardPaste,
  Search,
  Copy,
} from "lucide-react";
import type { Board, Task, Status, Mode } from "@/lib/types";
import { boardList, formatBoardList } from "@/lib/board-list";
import { Sheet } from "@/components/sheet";
import { isArchived } from "@/lib/archive";
import { RedactedText } from "@/components/redacted-text";
import { TaskEditor } from "@/components/task-editor";
import { useSessionDraft } from "@/components/use-session-draft";
import { PasteRequest, type ImportedItem } from "@/components/paste-request";
import { TaskChecklist } from "@/components/task-checklist";
import { TaskNote } from "@/components/task-note";
import { AppearanceControl } from "@/components/appearance-control";
import { useComposerDock } from "@/components/use-composer-dock";
import { useReadingPreferences } from "@/components/use-reading-preferences";
import { useMemoMutations } from "@/components/use-memo-mutations";
import {
  activeTasks,
  rowDestination,
  planMove,
  applyOrder,
  type DropTarget,
} from "@/lib/task-order";
import { memoCollision } from "@/components/memo-drag";
const statuses: Status[] = ["pending", "waiting", "done"];
const labels = { pending: "Pending", waiting: "Waiting", done: "Done" };
async function api(url: string, method: string, body?: unknown) {
  const r = await transport.request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(result.error || "Couldn’t save. Please try again.");
  return result;
}
export function MemoBoard({
  initial,
  mode,
  demo = false,
  personalActions,
  embedded = false,
}: {
  embedded?: boolean;
  initial: Board;
  mode: Mode;
  demo?: boolean;
  personalActions?: { onClaim: () => void; onShare: () => void };
}) {
  const {
    board,
    setBoard,
    busy,
    error,
    setError,
    canRetry,
    retryLast,
    inFlight,
    revision,
    change,
    undo,
    hiddenTaskId,
    remove,
    complete,
    undoLast,
    settleUndo,
  } = useMemoMutations(initial, demo);
  const writable = mode !== "viewer";
  const [query, setQuery] = useState("");
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newChecklists, setNewChecklists] = useState<string[]>([]);
  const [pasteHint, setPasteHint] = useState(() => {
    try {
      return writable && localStorage.getItem("memo:paste-hint") !== "seen";
    } catch {
      return writable;
    }
  });
  const [addDraft, setAddDraft] = useSessionDraft<Partial<Task> | null>(
    `memo:draft:v1:${initial.id}:add`,
    null,
    writable && !demo,
  );
  const rememberAdd = useCallback(
    (id: string, patch: Partial<Task> | null) =>
      setAddDraft(patch ? { ...patch, id } : null),
    [setAddDraft],
  );
  const [editing, setEditing] = useState<string | null>(null),
    [adding, setAdding] = useState(Boolean(addDraft)),
    [pasting, setPasting] = useState(false),
    [notice, setNotice] = useState(""),
    [share, setShare] = useState(false),
    [link, setLink] = useState(""),
    [shareBusy, setShareBusy] = useState(false),
    [fresh, setFresh] = useState(true);
  const { collapsed, expandedNotes, toggleDone, toggleNote, view, setView } =
    useReadingPreferences(initial.id, demo);
  const [showArchive, setShowArchive] = useState(false),
    [now, setNow] = useState(Date.now());
  const [addDirty, setAddDirty] = useState(false);
  const [drafts, setDrafts] = useSessionDraft<Record<string, Partial<Task>>>(
    `memo:draft:v1:${initial.id}:edits`,
    {},
    writable && !demo,
  );
  const rememberDraft = useCallback(
    (id: string, draft: Partial<Task> | null) => {
      setDrafts((current) => {
        if (!draft && !current[id]) return current;
        if (draft) return { ...current, [id]: draft };
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [setDrafts],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [destination, setDestination] = useState<DropTarget | null>(null);
  const pointerY = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [accountOpen]);
  const [redacted, setRedacted] = useState(true);
  useEffect(() => {
    try {
      setRedacted(localStorage.getItem("memo:redaction") !== "off");
    } catch {
      // The visual effect still works when browser storage is unavailable.
    }
  }, []);
  function toggleRedaction() {
    const next = !redacted;
    setRedacted(next);
    try {
      localStorage.setItem("memo:redaction", next ? "on" : "off");
    } catch {
      // Remembering a display preference is optional.
    }
  }
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const dockVisible = writable && !showArchive && !editing;
  const { dockRef, style: dockStyle } = useComposerDock(dockVisible, adding);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);
  useLayoutEffect(() => {
    if (dockVisible && adding) {
      dockRef.current
        ?.querySelector<HTMLInputElement>("input")
        ?.focus({ preventScroll: true });
    } else if (dockVisible && wasAdding.current) {
      addButtonRef.current?.focus({ preventScroll: true });
    }
    wasAdding.current = adding;
  }, [dockVisible, adding, dockRef]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    if (demo) return;
    let stopped = false;
    const refresh = async () => {
      if (
        document.hidden ||
        inFlight.current ||
        editing ||
        addDirty ||
        pasting ||
        activeId
      )
        return;
      try {
        const refreshVersion = revision.current;
        const r = await transport.request(
          initial.code
            ? `/api/memos/${initial.code}`
            : `/api/board${writable ? "" : "?viewer=1"}`,
          {
            cache: "no-store",
          },
        );
        if (!r.ok) {
          if (r.status === 401) {
            navigate(initial.code);
            return;
          }
          throw new Error();
        }
        const data = await r.json();
        if (
          !stopped &&
          !inFlight.current &&
          refreshVersion === revision.current
        ) {
          setBoard(data);
          setFresh(true);
        }
      } catch {
        if (!stopped) setFresh(false);
      }
    };
    const timer = setInterval(refresh, 8000);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [
    demo,
    initial.code,
    writable,
    editing,
    addDirty,
    pasting,
    activeId,
    inFlight,
    revision,
    setBoard,
  ]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function update(task: Task, patch: Partial<Task>, fromEditor = false) {
    const optimisticPatch =
      patch.status && patch.status !== task.status
        ? {
            ...patch,
            completed_at:
              patch.status === "done" ? new Date().toISOString() : null,
          }
        : patch;
    const transform = (current: Board) => ({
      ...current,
      tasks: current.tasks.map((t) =>
        t.id === task.id ? { ...t, ...optimisticPatch } : t,
      ),
    });
    const payload = { id: task.id, patch };
    const ok =
      patch.status && patch.status !== task.status
        ? await complete(
            task,
            "update",
            payload,
            transform,
            fromEditor,
            patch.status === "done" ? "complete" : "move",
          )
        : await change("update", payload, transform, fromEditor);
    if (ok) {
      setFresh(true);
      if (patch.status && patch.status !== task.status)
        setNotice(`Moved to ${labels[patch.status]}`);
      if (fromEditor) {
        rememberDraft(task.id, null);
        setEditing((current) => (current === task.id ? null : current));
      }
    }
    return ok;
  }
  async function leaveEditor(signOut = false) {
    if (!(await settleUndo())) return;
    try {
      if (signOut && !demo) await api("/api/auth/logout", "POST");
      navigate();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function dropDestination(event: DragMoveEvent): DropTarget | null {
    const { active, over } = event;
    if (!over || active.id === over.id) return null;
    const task = board.tasks.find((item) => item.id === active.id);
    if (!task) return null;
    if (statuses.includes(String(over.id) as Status)) {
      const status = String(over.id) as Status;
      const first = activeTasks(board.tasks, status, now, hiddenTaskId).find(
        (item) => item.id !== active.id,
      );
      return {
        status,
        beforeId:
          pointerY.current !== null && pointerY.current < over.rect.top + 44
            ? (first?.id ?? null)
            : null,
      };
    }
    const target = board.tasks.find((item) => item.id === over.id);
    if (!target) return null;
    const after =
      pointerY.current !== null
        ? pointerY.current >= over.rect.top + over.rect.height / 2
        : task.status === target.status && task.sort_order < target.sort_order;
    return rowDestination(
      board.tasks,
      task.id,
      target.id,
      after,
      now,
      hiddenTaskId,
    );
  }
  function previewDrop(event: DragMoveEvent) {
    const next = dropDestination(event);
    setDestination((previous) =>
      previous?.status === next?.status && previous?.beforeId === next?.beforeId
        ? previous
        : next,
    );
  }
  function cancelDrag() {
    setActiveId(null);
    setDestination(null);
    pointerY.current = null;
  }
  function onDragEnd(event: DragEndEvent) {
    const next = dropDestination(event);
    cancelDrag();
    if (!next || busy || editing || addDirty || query) return;
    const id = String(event.active.id);
    const task = board.tasks.find((item) => item.id === id);
    const changes = planMove(board.tasks, id, next, now, hiddenTaskId);
    if (!task || !changes) return;
    const transform = (current: Board) =>
      applyOrder(current, changes, new Date().toISOString());
    const saving = complete(
      task,
      "reorder",
      { items: changes },
      transform,
      false,
      next.status === "done" && task.status !== "done" ? "complete" : "move",
    );
    void saving.then((ok) => {
      if (ok) {
        setFresh(true);
        setNotice(`Moved to ${labels[next.status]}`);
      }
    });
  }
  function nudge(task: Task, offset: number) {
    const group = board.tasks
      .filter(
        (t) =>
          t.id !== hiddenTaskId &&
          t.status === task.status &&
          isArchived(t, now) === showArchive,
      )
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = group.findIndex((t) => t.id === task.id);
    const to = index + offset;
    if (to < 0 || to >= group.length) return;
    [group[index], group[to]] = [group[to], group[index]];
    const changes = group.map((t, i) => ({
      id: t.id,
      status: t.status,
      sort_order: i * 1024,
    }));
    void complete(
      task,
      "reorder",
      { items: changes },
      (current) => ({
        ...current,
        tasks: current.tasks.map((t) => ({
          ...t,
          ...changes.find((c) => c.id === t.id),
        })),
      }),
      false,
      "move",
    );
  }
  async function showViewerLink() {
    setShareBusy(true);
    setError("");
    try {
      const result = await api("/api/share", "POST", {});
      setLink(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setShareBusy(false);
    }
  }
  const date = new Date(board.updated_at);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = date.toDateString() === new Date().toDateString();
  const archived = board.tasks.filter(
    (t) => t.id !== hiddenTaskId && isArchived(t, now),
  );
  const draggedTask = board.tasks.find((task) => task.id === activeId);
  const visibleTasks = boardList(
    board.tasks,
    now,
    showArchive,
    hiddenTaskId,
    query,
  );
  const searchCount = visibleTasks.length;
  async function copyList() {
    const text = formatBoardList(board.title, visibleTasks);
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(text);
      setNotice(query.trim() ? "Matching items copied" : "List copied");
    } catch {
      setCopyFallback(text);
    } finally {
      setCopyBusy(false);
    }
  }
  const renderTask = (
    task: Task,
    tasks: Task[],
    index: number,
    list = false,
  ) => (
    <TaskRow
      key={task.id}
      task={task}
      list={list}
      initiallyOpen={
        list || newChecklists.includes(task.id) || Boolean(query.trim())
      }
      personal={Boolean(initial.code)}
      draft={drafts[task.id]}
      onDraftChange={rememberDraft}
      writable={writable}
      busy={busy}
      dragDisabled={
        busy ||
        Boolean(editing) ||
        addDirty ||
        showArchive ||
        Boolean(query.trim())
      }
      dragActive={Boolean(activeId)}
      reducedMotion={reducedMotion}
      canMoveUp={
        !query.trim() &&
        tasks.slice(0, index).some((item) => item.status === task.status)
      }
      canMoveDown={
        !query.trim() &&
        tasks.slice(index + 1).some((item) => item.status === task.status)
      }
      dropBefore={Boolean(activeId && destination?.beforeId === task.id)}
      expanded={expandedNotes.includes(task.id) || Boolean(query.trim())}
      onToggleNote={() => toggleNote(task.id)}
      editing={editing === task.id}
      onEdit={() => setEditing(task.id)}
      onCancel={() => {
        rememberDraft(task.id, null);
        setEditing(null);
        setError("");
      }}
      onSave={(patch, fromEditor) => update(task, patch, fromEditor)}
      onDelete={() => {
        void remove(task);
      }}
      onMove={(offset) => nudge(task, offset)}
    />
  );
  const content = (
    <>
      {query.trim() && (
        <p className="search-summary" role="status">
          {searchCount
            ? `${searchCount} matching ${searchCount === 1 ? "item" : "items"}`
            : "No items found. Try another word."}
        </p>
      )}
      {view === "list" ? (
        <section
          className="unified-list"
          aria-label={showArchive ? "Archived list" : "All items"}
        >
          <SortableContext
            items={visibleTasks.map((task) => task.id)}
            strategy={verticalListSortingStrategy}
          >
            {visibleTasks.map((task, index) =>
              renderTask(task, visibleTasks, index, true),
            )}
          </SortableContext>
          {!visibleTasks.length && !query.trim() && (
            <p className="section-empty">
              {showArchive
                ? "No archived items yet."
                : writable
                  ? "A fresh list. Add your first item below."
                  : "Nothing on this board yet."}
            </p>
          )}
        </section>
      ) : (
        (showArchive ? (["done"] as Status[]) : statuses).map((status) => {
          const tasks = visibleTasks.filter((task) => task.status === status);
          if (query.trim() && !tasks.length) return null;
          return (
            <Section
              key={status}
              archived={showArchive}
              status={status}
              count={tasks.length}
              writable={
                writable &&
                !showArchive &&
                !busy &&
                !editing &&
                !addDirty &&
                !query
              }
              dropAtEnd={Boolean(
                activeId &&
                destination?.status === status &&
                destination.beforeId === null,
              )}
              dragging={Boolean(activeId)}
              collapseDisabled={busy || Boolean(editing) || Boolean(activeId)}
              collapsed={
                !showArchive &&
                status === "done" &&
                collapsed &&
                !activeId &&
                !query
              }
              toggle={toggleDone}
            >
              <SortableContext
                items={tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                {tasks.map((task, index) => renderTask(task, tasks, index))}
              </SortableContext>
              {tasks.length === 0 && (
                <p className="section-empty">
                  {query
                    ? "No matching items here."
                    : status === "pending"
                      ? activeId
                        ? "Drop here"
                        : "Nothing pending. A little breathing room."
                      : status === "waiting"
                        ? activeId
                          ? "Drop here"
                          : "Nothing waiting."
                        : showArchive
                          ? "No archived items yet."
                          : activeId
                            ? "Drop here"
                            : "Completed items stay here for 24 hours, then move to Archived."}
                </p>
              )}
            </Section>
          );
        })
      )}
    </>
  );
  return (
    <main
      className={`memo-shell${embedded ? " embedded-memo" : ""}${writable ? "" : " viewer-memo"}${redacted ? " redacted" : ""}${dockVisible ? " has-quick-add" : ""}`}
      style={dockStyle}
    >
      {initial.code && !embedded && (
        <nav className="personal-topbar" aria-label="Board controls">
          <button
            className="text-button"
            disabled={busy || addDirty || Boolean(editing)}
            onClick={() => void leaveEditor()}
          >
            ‹ Boards
          </button>
          <span className="board-number">{initial.code}</span>
          {writable ? (
            <div className="personal-actions">
              {!board.claimed && (
                <button
                  className="text-button claim-button"
                  disabled={busy || addDirty || Boolean(editing)}
                  onClick={async () => {
                    if (await settleUndo()) personalActions?.onClaim();
                  }}
                >
                  Save with email
                </button>
              )}
              <button
                className="icon-button"
                aria-label="Share board"
                disabled={busy || addDirty || Boolean(editing)}
                onClick={async () => {
                  if (await settleUndo()) personalActions?.onShare();
                }}
              >
                <Share2 size={20} />
              </button>
            </div>
          ) : (
            <span className="quiet-label">Shared with you</span>
          )}
        </nav>
      )}
      {writable && !initial.code && (
        <div className="topbar">
          <span className="quiet-label editing-label">
            <span className="sync-dot" />
            Editing
          </span>
          {writable && (
            <div className="top-actions">
              <button
                className="view-board-button"
                disabled={busy}
                onClick={() => void leaveEditor()}
              >
                <Eye size={15} />
                View board
              </button>
              {!demo && (
                <div
                  className="account-controls"
                  ref={accountRef}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setAccountOpen(false);
                      accountRef.current
                        ?.querySelector<HTMLButtonElement>("button")
                        ?.focus();
                    }
                  }}
                >
                  <button
                    className="icon-button"
                    aria-label="Admin menu"
                    aria-expanded={accountOpen}
                    onClick={() => setAccountOpen(!accountOpen)}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {accountOpen && (
                    <div className="row-menu account-menu">
                      <button
                        onClick={() => {
                          setAccountOpen(false);
                          setShare(true);
                          if (!link && !shareBusy) void showViewerLink();
                        }}
                      >
                        <Share2 size={16} />
                        Share memo
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void leaveEditor(true)}
                      >
                        <LogOut size={16} />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <header className="board-header">
        <span className="memo-signature" aria-hidden="true">
          little board<span>.</span>
        </span>
        <h1>
          {writable ? (
            <input
              className="board-title-input"
              aria-label="Board title"
              defaultValue={board.title}
              key={board.title}
              maxLength={100}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = board.title;
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                const title = e.target.value.trim();
                if (!title) {
                  e.target.value = board.title;
                  return;
                }
                if (title !== board.title)
                  void change(
                    "rename",
                    { title },
                    (current) => ({ ...current, title }),
                    true,
                  );
              }}
            />
          ) : (
            board.title
          )}
        </h1>
        <div className="header-meta">
          <div
            className={`updated${busy ? " is-saving" : ""}${error && writable ? " is-unsaved" : ""}`}
            role="status"
            suppressHydrationWarning
          >
            {busy ? (
              "Saving…"
            ) : error && writable ? (
              "Not saved · please retry"
            ) : !fresh ? (
              "Offline · reconnecting…"
            ) : (
              <>
                <span className="sync-dot" />
                {writable && !demo
                  ? initial.code && !board.claimed
                    ? "Saved on this device · "
                    : "Saved · "
                  : ""}
                {writable && !demo ? "" : "Updated "}
                {sameDay
                  ? ""
                  : date.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    }) + " at "}
                {time}
              </>
            )}
          </div>
          <div className="header-controls">
            <button
              className="icon-button"
              aria-label="Search board"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(!searchOpen);
                if (searchOpen) setQuery("");
              }}
            >
              <Search size={17} />
            </button>
            <button
              className="redaction-toggle"
              aria-label="Redaction effect"
              aria-pressed={redacted}
              title={
                redacted
                  ? "Show redacted words"
                  : "Redact names and sensitive words"
              }
              onClick={toggleRedaction}
            >
              {redacted ? <EyeOff size={14} /> : <Eye size={14} />}
              {redacted ? "Redacted" : "Redact"}
            </button>
          </div>
        </div>
      </header>
      <div className="view-toolbar">
        <div className="view-switch" role="group" aria-label="Board layout">
          <button
            aria-pressed={view === "board"}
            disabled={busy || Boolean(editing) || Boolean(activeId)}
            onClick={() => setView("board")}
          >
            Board
          </button>
          <button
            aria-pressed={view === "list"}
            disabled={busy || Boolean(editing) || Boolean(activeId)}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
        {view === "list" && (
          <button
            className="text-button copy-list"
            disabled={
              !visibleTasks.length ||
              copyBusy ||
              busy ||
              Boolean(editing) ||
              addDirty
            }
            onClick={() => void copyList()}
            title="Copy saved titles, notes and checklist steps as plain text"
          >
            <Copy size={14} />
            {copyBusy
              ? "Copying…"
              : query.trim()
                ? "Copy results"
                : "Copy list"}
          </button>
        )}
      </div>
      {copyFallback !== null && (
        <Sheet title="Copy your list" onClose={() => setCopyFallback(null)}>
          <p>
            Your browser couldn’t copy automatically. Select and copy the text
            below.
          </p>
          <textarea
            className="copy-list-text"
            aria-label="List to copy"
            readOnly
            value={copyFallback}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Sheet>
      )}
      {searchOpen && (
        <div className="board-search">
          <Search size={16} />
          <input
            type="search"
            autoFocus
            aria-label="Find items"
            placeholder="Find an item or step…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                setSearchOpen(false);
              }
            }}
          />
          <button
            className="icon-button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {writable &&
        Object.keys(drafts).some((id) =>
          board.tasks.some((task) => task.id === id),
        ) && (
          <p className="draft-recovery" role="status">
            You have an unsaved edit. Tap its item to continue.
          </p>
        )}
      {share && writable && !demo && (
        <div className="share-panel">
          <div className="share-heading">
            <h2>Share this memo</h2>
            <button
              className="icon-button"
              aria-label="Close sharing"
              onClick={() => setShare(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p>
            Anyone with this address can read the memo. Editing needs your admin
            password.
          </p>
          {link ? (
            <>
              <input
                className="share-input"
                value={link}
                readOnly
                aria-label="Board address"
                onFocus={(e) => e.target.select()}
              />
              <button
                className="solid-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setNotice("Board link copied");
                  } catch {
                    setNotice("Select and copy the link above");
                  }
                }}
              >
                <Link2 size={16} />
                Copy board link
              </button>
              <p className="caption">
                One ordinary web address. No account or special link needed to
                view.
              </p>
            </>
          ) : (
            <>
              <button
                className="solid-button"
                disabled={shareBusy}
                onClick={showViewerLink}
              >
                {shareBusy ? "Getting link…" : "Try again"}
              </button>
              <p className="caption">
                The board address always stays the same.
              </p>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          {canRetry && !editing && !adding && !pasting && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                void retryLast().then((ok) => {
                  if (ok) {
                    setFresh(true);
                    setNotice("Saved");
                  }
                })
              }
            >
              Retry save
            </button>
          )}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {writable ? (
        <DndContext
          sensors={sensors}
          autoScroll={{
            acceleration: 6,
            interval: 16,
            threshold: { x: 0, y: 0.15 },
          }}
          collisionDetection={(args) => {
            pointerY.current = args.pointerCoordinates?.y ?? null;
            return memoCollision(args);
          }}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={({ active }) => {
            revision.current++;
            setActiveId(String(active.id));
            setAccountOpen(false);
          }}
          onDragMove={previewDrop}
          onDragOver={previewDrop}
          onDragEnd={onDragEnd}
          onDragCancel={cancelDrag}
          accessibility={{
            screenReaderInstructions: {
              draggable:
                "Press Space to pick up an item. Use the arrow keys to move it. Press Space again to drop, or Escape to cancel.",
            },
            announcements: {
              onDragStart: ({ active }) =>
                `Picked up ${board.tasks.find((task) => task.id === active.id)?.title || "item"}.`,
              onDragOver: ({ over }) =>
                over
                  ? `Over ${labels[(over.data.current?.status || over.id) as Status] || "item"}.`
                  : "Outside the list. Release to cancel.",
              onDragEnd: ({ over }) =>
                over ? "Item dropped." : "Move cancelled.",
              onDragCancel: () =>
                "Move cancelled. Item stays in its original position.",
            },
          }}
        >
          {content}
          <DragOverlay
            dropAnimation={
              reducedMotion ? null : { duration: 160, easing: "ease-out" }
            }
          >
            {draggedTask && (
              <div
                className={`drag-preview${redacted ? " redacted" : ""}`}
                aria-hidden="true"
              >
                <GripVertical size={16} />
                <span className="drag-preview-copy">
                  <span className="task-title">
                    <RedactedText>{draggedTask.title}</RedactedText>
                  </span>
                  <span className="drag-preview-caption">
                    {destination
                      ? `Move to ${labels[destination.status]}${destination.beforeId ? " · before " + (board.tasks.find((item) => item.id === destination.beforeId)?.title || "item") : " · at the end"}`
                      : "Drag to a position"}
                  </span>
                </span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        content
      )}
      {writable && !showArchive && (
        <div className="add-area" ref={dockRef} hidden={!dockVisible}>
          {adding ? (
            <TaskEditor
              personal={Boolean(initial.code)}
              busy={busy}
              draft={addDraft || undefined}
              draftId={addDraft?.id}
              onDraftChange={rememberAdd}
              onDirtyChange={setAddDirty}
              onCancel={() => {
                setAdding(false);
                setAddDirty(false);
                setAddDraft(null);
              }}
              onSave={async (patch, id) => {
                setNotice("");
                const now = new Date().toISOString();
                const task = {
                  id,
                  board_id: board.id,
                  title: patch.title!,
                  note: patch.note || "",
                  checklist: patch.checklist,
                  original_request: patch.original_request,
                  status: patch.status || "pending",
                  assigned_to: patch.assigned_to || null,
                  sort_order:
                    Math.max(0, ...board.tasks.map((t) => t.sort_order)) + 1024,
                  created_at: now,
                  updated_at: now,
                  completed_at: patch.status === "done" ? now : null,
                };
                const ok = await change("add", { task }, (current) => ({
                  ...current,
                  tasks: [...current.tasks, task],
                }));
                if (ok) {
                  setFresh(true);
                  if (task.checklist?.length)
                    setNewChecklists((current) => [...current, task.id]);
                  setNotice(`Added to ${labels[task.status]}`);
                }
                return ok;
              }}
            />
          ) : (
            <div className="add-actions">
              <button
                ref={addButtonRef}
                className="add-button"
                disabled={busy || Boolean(activeId)}
                onClick={() => {
                  setEditing(null);
                  setAdding(true);
                }}
              >
                <Plus size={20} />
                Add item
              </button>
              <button
                className="paste-button icon-button"
                aria-label="Paste a request"
                title="Paste a request"
                disabled={busy || Boolean(activeId)}
                onClick={() => {
                  setError("");
                  setPasteHint(false);
                  try {
                    localStorage.setItem("memo:paste-hint", "seen");
                  } catch {}
                  setPasting(true);
                }}
              >
                <ClipboardPaste size={20} />
                <span className="paste-label">Paste request</span>
              </button>
            </div>
          )}
          {pasteHint && !adding && (
            <p className="paste-hint">
              Client sent a list? Paste it to turn it into items.
              <button
                className="icon-button"
                aria-label="Dismiss paste hint"
                onClick={() => {
                  setPasteHint(false);
                  try {
                    localStorage.setItem("memo:paste-hint", "seen");
                  } catch {}
                }}
              >
                <X size={13} />
              </button>
            </p>
          )}
        </div>
      )}
      {pasting && writable && (
        <PasteRequest
          boardId={demo ? undefined : initial.id}
          onClose={() => setPasting(false)}
          onAdd={async (items: ImportedItem[]) => {
            const stamp = new Date().toISOString();
            const highest = Math.max(
              0,
              ...board.tasks.map((task) => task.sort_order),
            );
            const tasks: Task[] = items.map((item, index) => ({
              ...item,
              board_id: board.id,
              note: "",
              status: "pending",
              assigned_to: null,
              sort_order: highest + (index + 1) * 1024,
              created_at: stamp,
              updated_at: stamp,
              completed_at: null,
            }));
            const ok = await change("add_many", { tasks }, (current) => ({
              ...current,
              tasks: [
                ...current.tasks,
                ...tasks.filter(
                  (task) =>
                    !current.tasks.some((existing) => existing.id === task.id),
                ),
              ],
            }));
            if (ok) {
              setFresh(true);
              setNewChecklists((current) => [
                ...current,
                ...tasks
                  .filter((task) => task.checklist?.length)
                  .map((task) => task.id),
              ]);
              setNotice(
                `Added ${tasks.length === 1 ? (tasks[0].checklist?.length ? "a checklist" : "an item") : `${tasks.length} items`} to Pending`,
              );
            }
            return ok;
          }}
        />
      )}
      {writable && (
        <button
          className="archive-button"
          disabled={busy || addDirty}
          onClick={() => {
            setShowArchive(!showArchive);
            setEditing(null);
            setAdding(false);
            setAddDirty(false);
          }}
        >
          {showArchive
            ? "← Back to memo"
            : `Archived${archived.length ? " · " + archived.length : ""}`}
        </button>
      )}
      {!embedded && (
        <footer className="memo-footer">
          <span className="footer-status">
            <Check size={12} />
            {demo
              ? "Sample board · changes aren’t saved"
              : writable
                ? initial.code && !board.claimed
                  ? "Saved on this device."
                  : "Only you can edit."
                : "Updates automatically"}
          </span>
          <div className="footer-controls">
            <AppearanceControl />
            {!writable && !initial.code && (
              <a
                className="edit-entry"
                href={demo ? "/preview" : "/admin"}
                aria-label="Edit memo"
                title="Sign in to edit"
              >
                Edit
              </a>
            )}
          </div>
        </footer>
      )}
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
          <Check size={16} />
          {notice}
        </div>
      )}
    </main>
  );
}
function Section({
  status,
  count,
  children,
  writable,
  collapsed,
  toggle,
  archived = false,
  dropAtEnd = false,
  dragging = false,
  collapseDisabled = false,
}: {
  dropAtEnd?: boolean;
  dragging?: boolean;
  collapseDisabled?: boolean;
  archived?: boolean;
  status: Status;
  count: number;
  children: React.ReactNode;
  writable: boolean;
  collapsed: boolean;
  toggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { kind: "section", status, count },
    disabled: !writable,
  });
  return (
    <section
      ref={setNodeRef}
      className={`task-section section-${status} ${isOver ? "drop-over" : ""}${dropAtEnd ? " drop-at-end" : ""}${dragging ? " accepting-drop" : ""}`}
      aria-label={labels[status]}
    >
      <div className="section-heading">
        {status === "done" && !archived ? (
          <button
            className="collapse-button"
            disabled={collapseDisabled}
            onClick={toggle}
            aria-expanded={!collapsed}
          >
            <ChevronDown
              size={14}
              className={collapsed ? "chevron collapsed" : "chevron"}
            />
            <h2>{labels[status]}</h2>
          </button>
        ) : (
          <h2>{archived ? "Archived" : labels[status]}</h2>
        )}
        <span className="section-count">{count}</span>
      </div>
      {!collapsed && <div className="task-list">{children}</div>}
    </section>
  );
}
function TaskRow({
  initiallyOpen = false,
  list = false,
  personal = false,
  task,
  draft,
  onDraftChange,
  expanded,
  onToggleNote,
  dragDisabled,
  dragActive,
  reducedMotion,
  canMoveUp,
  canMoveDown,
  dropBefore,
  writable,
  busy,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onMove,
}: {
  task: Task;
  initiallyOpen?: boolean;
  list?: boolean;
  personal?: boolean;
  draft?: Partial<Task>;
  onDraftChange: (id: string, draft: Partial<Task> | null) => void;
  expanded: boolean;
  onToggleNote: () => void;
  dragDisabled: boolean;
  dragActive: boolean;
  reducedMotion: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dropBefore: boolean;
  writable: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<Task>, fromEditor?: boolean) => Promise<boolean>;
  onDelete: () => void;
  onMove: (offset: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useSortable({
      id: task.id,
      data: { kind: "task", status: task.status },
      disabled: !writable || dragDisabled || editing,
    });
  const rowRef = useRef<HTMLDivElement | null>(null);
  const previousTop = useRef<number | null>(null);
  const movement = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const top =
      getClientRect(row, { ignoreTransform: true }).top + window.scrollY;
    const difference =
      previousTop.current === null ? 0 : previousTop.current - top;
    if (difference && !dragActive && !reducedMotion && row.animate) {
      movement.current?.cancel();
      movement.current = row.animate(
        [
          { transform: `translateY(${difference}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 180, easing: "ease-out" },
      );
    }
    previousTop.current = top;
  });
  const [menu, setMenu] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!toolsRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);
  useEffect(() => {
    if (dragActive) setMenu(false);
  }, [dragActive]);
  return (
    <div
      ref={(node) => {
        rowRef.current = node;
        setNodeRef(node);
      }}
      data-task-id={task.id}
      className={`task-row ${task.status} ${isDragging ? "dragging" : ""} ${editing ? "editing" : ""}${dropBefore ? " drop-before" : ""}${list ? " list-row" : task.checklist?.length ? " task-card" : ""}`}
    >
      {writable ? (
        <button
          className="status-button"
          aria-label={
            task.status === "done"
              ? `Reopen ${task.title}`
              : `Complete ${task.title}`
          }
          disabled={busy || editing}
          onClick={() =>
            onSave({ status: task.status === "done" ? "pending" : "done" })
          }
        >
          <span className={`status-circle ${task.status}`}>
            {task.status === "done" && <Check size={13} strokeWidth={2.4} />}
          </span>
        </button>
      ) : (
        <span className="status-readonly" aria-label={labels[task.status]}>
          <span className={`status-circle ${task.status}`}>
            {task.status === "done" && <Check size={13} strokeWidth={2.4} />}
          </span>
        </span>
      )}
      {editing ? (
        <TaskEditor
          personal={personal}
          task={task}
          draft={draft}
          onDraftChange={onDraftChange}
          busy={busy}
          onSave={(patch) => onSave(patch, true)}
          onCancel={onCancel}
        />
      ) : (
        <>
          <div className="task-copy">
            {writable ? (
              <button
                className="task-title task-title-button"
                disabled={busy}
                onClick={onEdit}
                title={new Date(task.updated_at).toLocaleString()}
              >
                <RedactedText>{task.title}</RedactedText>
              </button>
            ) : (
              <span
                className="task-title"
                title={new Date(task.updated_at).toLocaleString()}
              >
                <RedactedText>{task.title}</RedactedText>
              </span>
            )}
            {draft && writable && (
              <span className="unsaved-label">Unsaved edit</span>
            )}
            {list && (
              <span className={`list-status list-status-${task.status}`}>
                {labels[task.status]}
              </span>
            )}
            {task.note && (list || !task.checklist?.length) && (
              <TaskNote
                task={task}
                compact={list}
                expanded={expanded}
                onToggle={onToggleNote}
              />
            )}
            <TaskChecklist
              task={task}
              initiallyOpen={initiallyOpen}
              hideNote={list}
              writable={writable}
              busy={busy}
              onSave={onSave}
            />
          </div>
          {task.assigned_to && task.status !== "done" && (
            <span className="assignee">
              <RedactedText>
                {task.assigned_to === "me"
                  ? "Owner"
                  : task.assigned_to === "partner"
                    ? "Partner"
                    : task.assigned_to}
              </RedactedText>
            </span>
          )}
          {writable && (
            <div
              className="row-tools"
              ref={toolsRef}
              onBlur={(event) => {
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !event.currentTarget.contains(event.relatedTarget)
                )
                  setMenu(false);
              }}
            >
              <button
                ref={setActivatorNodeRef}
                className="drag-handle icon-button"
                title="Drag to move · or use arrow keys after pressing Space"
                aria-label={`Reorder ${task.title}`}
                {...attributes}
                {...listeners}
                disabled={dragDisabled}
              >
                <GripVertical size={16} />
              </button>
              <button
                ref={menuButton}
                className="icon-button more-button"
                aria-label={`Options for ${task.title}`}
                aria-expanded={menu}
                disabled={busy}
                onClick={() => setMenu(!menu)}
              >
                <MoreHorizontal size={18} />
              </button>
              {menu && (
                <div
                  className="row-menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setMenu(false);
                      menuButton.current?.focus();
                    }
                  }}
                >
                  <label className="move-label">Move to…</label>
                  <select
                    aria-label={`Status for ${task.title}`}
                    value={task.status}
                    onChange={(e) => {
                      void onSave({ status: e.target.value as Status });
                      setMenu(false);
                    }}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !canMoveUp}
                    onClick={() => {
                      onMove(-1);
                      setMenu(false);
                    }}
                  >
                    <ArrowUp size={15} />
                    Move up
                  </button>
                  <button
                    disabled={busy || !canMoveDown}
                    onClick={() => {
                      onMove(1);
                      setMenu(false);
                    }}
                  >
                    <ArrowDown size={15} />
                    Move down
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      onDelete();
                      setMenu(false);
                    }}
                  >
                    <Trash2 size={15} />
                    Delete item
                  </button>
                  <button onClick={() => setMenu(false)}>Close</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
