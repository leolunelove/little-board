"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { Task, Status } from "@/lib/types";

export function TaskEditor({
  task,
  busy = false,
  onSave,
  onCancel,
  onDirtyChange,
  draft,
  personal = false,
  onDraftChange,
}: {
  task?: Task;
  personal?: boolean;
  draft?: Partial<Task>;
  onDraftChange?: (id: string, draft: Partial<Task> | null) => void;
  busy?: boolean;
  onSave: (patch: Partial<Task>, id: string) => Promise<boolean>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(draft?.title ?? task?.title ?? "");
  const [note, setNote] = useState(draft?.note ?? task?.note ?? "");
  const [status, setStatus] = useState<Status>(
    draft?.status ?? task?.status ?? "pending",
  );
  const [assigned, setAssigned] = useState(
    draft ? draft.assigned_to || "" : task?.assigned_to || "",
  );
  const [details, setDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useRef(task?.id || crypto.randomUUID());
  const submitting = useRef(false);
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const dirty = Boolean(title || note || assigned || status !== "pending");
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!task || !onDraftChange) return;
    const changed =
      title !== task.title ||
      note !== task.note ||
      status !== task.status ||
      assigned !== (task.assigned_to || "");
    onDraftChange(
      task.id,
      changed
        ? {
            title,
            note,
            status,
            assigned_to: (assigned as Task["assigned_to"]) || null,
          }
        : null,
    );
  }, [task, title, note, status, assigned, onDraftChange]);
  const changed =
    !task ||
    title.trim() !== task.title ||
    note.trim() !== task.note ||
    status !== task.status ||
    assigned !== (task.assigned_to || "");
  function cancel() {
    cancelled.current = true;
    onCancel();
  }
  const locked = saving || busy;
  return (
    <form
      className={`task-editor${task ? "" : " quick-add"}${details ? " details-open" : ""}`}
      aria-label={task ? "Edit item" : "Add item"}
      onBlur={(event) => {
        if (!task || cancelled.current || locked || failed) return;
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        if (!changed) {
          cancel();
          return;
        }
        if (title.trim()) event.currentTarget.requestSubmit();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || locked || submitting.current) return;
        if (!changed) {
          cancel();
          return;
        }
        submitting.current = true;
        setSaving(true);
        setFailed(false);
        let ok = false;
        try {
          ok = await onSave(
            {
              title: title.trim(),
              note: note.trim(),
              status,
              assigned_to: (assigned as Task["assigned_to"]) || null,
            },
            id.current,
          );
        } catch {
          ok = false;
        }
        submitting.current = false;
        setSaving(false);
        if (!ok) {
          setFailed(true);
          input.current?.focus();
          return;
        }
        if (!task) {
          setTitle("");
          setNote("");
          setStatus("pending");
          setAssigned("");
          setDetails(false);
          id.current = crypto.randomUUID();
          input.current?.focus();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !locked) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          event.currentTarget.requestSubmit();
        }
      }}
    >
      <div className="editor-title-line">
        {!task && <Plus size={18} aria-hidden="true" />}
        <input
          ref={input}
          autoFocus
          aria-label="Item title"
          placeholder={task ? "What needs to happen?" : "Add an item…"}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setFailed(false);
          }}
          maxLength={240}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint={task ? "done" : "enter"}
          spellCheck
          required
          readOnly={locked}
        />
        {!task && (
          <button
            className="save-button"
            type="submit"
            disabled={!title.trim() || locked}
          >
            {saving ? "Adding…" : failed ? "Retry" : "Add"}
          </button>
        )}
      </div>
      {details && (
        <div className="editor-details">
          <label className="sr-only" htmlFor={`note-${id.current}`}>
            Short note
          </label>
          <textarea
            id={`note-${id.current}`}
            aria-label="Short note"
            placeholder="Add a short note…"
            value={note}
            rows={2}
            onChange={(event) => {
              setNote(event.target.value);
              setFailed(false);
            }}
            maxLength={400}
            readOnly={locked}
          />
          <div className="editor-fields">
            <select
              aria-label="Item status"
              value={status}
              disabled={locked}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              <option value="pending">Pending</option>
              <option value="waiting">Waiting</option>
              <option value="done">Done</option>
            </select>
            <select
              aria-label="Assigned to"
              value={assigned}
              disabled={locked}
              onChange={(event) => setAssigned(event.target.value)}
            >
              <option value="">Unassigned</option>
              <option value="me">Me</option>
              <option value="partner">Partner</option>
            </select>
          </div>
        </div>
      )}
      {failed && (
        <p className="draft-error" role="alert">
          Couldn’t save. Your text is still here—try again.
        </p>
      )}
      <div className="editor-bottom">
        <button
          type="button"
          className="text-button"
          aria-expanded={details}
          disabled={locked}
          onClick={() => setDetails(!details)}
        >
          <ChevronDown size={13} />
          {details ? "Less detail" : "Add details"}
        </button>
        <span className="editor-spacer" />
        <button
          type="button"
          className="text-button"
          disabled={locked}
          onPointerDown={(event) => event.preventDefault()}
          onClick={cancel}
        >
          {task || dirty ? "Cancel" : "Done adding"}
        </button>
        {task && (
          <button
            className="save-button"
            type="submit"
            disabled={!title.trim() || locked || (!changed && !failed)}
          >
            {saving ? "Saving…" : failed ? "Retry" : "Save"}
          </button>
        )}
      </div>
    </form>
  );
}
