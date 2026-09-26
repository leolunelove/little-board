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
} from "lucide-react";
import type { Board, Task, Status, Mode } from "@/lib/types";
import { isArchived } from "@/lib/archive";
import { RedactedText } from "@/components/redacted-text";
import { TaskEditor } from "@/components/task-editor";
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
}: {
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
  const [editing, setEditing] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [notice, setNotice] = useState(""),
    [share, setShare] = useState(false),
    [link, setLink] = useState(""),
    [shareBusy, setShareBusy] = useState(false),
    [fresh, setFresh] = useState(true);
  const { collapsed, expandedNotes, toggleDone, toggleNote } =
    useReadingPreferences(initial.id, demo);
  const [showArchive, setShowArchive] = useState(false),
    [now, setNow] = useState(Date.now());
  const [addDirty, setAddDirty] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Partial<Task>>>({});
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
    [],
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
  const writable = mode !== "viewer";
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
      patch.status === "done" && task.status !== "done"
        ? await complete(task, "update", payload, transform, fromEditor)
        : await change("update", payload, transform, fromEditor);
    if (ok) {
      setFresh(true);
      if (fromEditor) {
        rememberDraft(task.id, null);
        setEditing(null);
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
    if (!next || busy || editing || addDirty) return;
    const id = String(event.active.id);
    const task = board.tasks.find((item) => item.id === id);
    const changes = planMove(board.tasks, id, next, now, hiddenTaskId);
    if (!task || !changes) return;
    const transform = (current: Board) =>
      applyOrder(current, changes, new Date().toISOString());
    const saving =
      next.status === "done" && task.status !== "done"
        ? complete(task, "reorder", { items: changes }, transform)
        : change("reorder", { items: changes }, transform);
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
    void change("reorder", { items: changes }, (current) => ({
      ...current,
      tasks: current.tasks.map((t) => ({
        ...t,
        ...changes.find((c) => c.id === t.id),
      })),
    }));
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
  const content = (
    <>
      {(showArchive ? (["done"] as Status[]) : statuses).map((status) => {
        const tasks = board.tasks
          .filter(
            (t) =>
              t.id !== hiddenTaskId &&
              t.status === status &&
              isArchived(t, now) === showArchive,
          )
          .sort((a, b) => a.sort_order - b.sort_order);
        return (
          <Section
            key={status}
            archived={showArchive}
            status={status}
            count={tasks.length}
            writable={
              writable && !showArchive && !busy && !editing && !addDirty
            }
            dropAtEnd={Boolean(
              activeId &&
              destination?.status === status &&
              destination.beforeId === null,
            )}
            dragging={Boolean(activeId)}
            collapseDisabled={busy || Boolean(editing) || Boolean(activeId)}
            collapsed={
              !showArchive && status === "done" && collapsed && !activeId
            }
            toggle={toggleDone}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  personal={Boolean(initial.code)}
                  draft={drafts[task.id]}
                  onDraftChange={rememberDraft}
                  writable={writable}
                  busy={busy}
                  dragDisabled={
                    busy || Boolean(editing) || addDirty || showArchive
                  }
                  dragActive={Boolean(activeId)}
                  reducedMotion={reducedMotion}
                  canMoveUp={index > 0}
                  canMoveDown={index < tasks.length - 1}
                  dropBefore={Boolean(
                    activeId && destination?.beforeId === task.id,
                  )}
                  expanded={expandedNotes.includes(task.id)}
                  onToggleNote={() => toggleNote(task.id)}
                  editing={editing === task.id}
                  onEdit={() => {
                    setEditing(task.id);
                  }}
                  onCancel={() => {
                    rememberDraft(task.id, null);
                    setEditing(null);
                  }}
                  onSave={(patch, fromEditor) =>
                    update(task, patch, fromEditor)
                  }
                  onDelete={() => {
                    void remove(task);
                  }}
                  onMove={(offset) => nudge(task, offset)}
                />
              ))}
            </SortableContext>
            {tasks.length === 0 && (
              <p className="section-empty">
                {status === "pending"
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
                        : "Completed items will appear here."}
              </p>
            )}
          </Section>
        );
      })}
    </>
  );
  return (
    <main
      className={`memo-shell${writable ? "" : " viewer-memo"}${redacted ? " redacted" : ""}${dockVisible ? " has-quick-add" : ""}`}
      style={dockStyle}
    >
      {initial.code && (
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
          <div className="updated" aria-live="polite" suppressHydrationWarning>
            {busy ? (
              "Saving…"
            ) : !fresh ? (
              "Offline · reconnecting…"
            ) : (
              <>
                <span className="sync-dot" />
                Updated{" "}
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
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {writable ? (
        <DndContext
          sensors={sensors}
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
                      ? `Move to ${labels[destination.status]}`
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
              onDirtyChange={setAddDirty}
              onCancel={() => {
                setAdding(false);
                setAddDirty(false);
              }}
              onSave={async (patch, id) => {
                setNotice("");
                const now = new Date().toISOString();
                const task = {
                  id,
                  board_id: board.id,
                  title: patch.title!,
                  note: patch.note || "",
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
                  setNotice(`Added to ${labels[task.status]}`);
                }
                return ok;
              }}
            />
          ) : (
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
          )}
        </div>
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
      {undo && (
        <div className="toast undo-toast" role="status">
          <span>
            {undo.committing
              ? "Removing…"
              : undo.kind === "delete"
                ? "Item removed"
                : "Item completed"}
          </span>
          <button
            disabled={busy || Boolean(undo.committing)}
            onClick={() => void undoLast()}
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
      className={`task-row ${task.status} ${isDragging ? "dragging" : ""} ${editing ? "editing" : ""}${dropBefore ? " drop-before" : ""}`}
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
            {task.note && (
              <TaskNote
                task={task}
                expanded={expanded}
                onToggle={onToggleNote}
              />
            )}
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
                  <select
                    aria-label={`Status for ${task.title}`}
                    value={task.status}
                    onChange={(e) => {
                      onSave({ status: e.target.value as Status });
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
