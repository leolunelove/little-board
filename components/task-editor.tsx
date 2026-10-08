"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import type { Task, Status } from "@/lib/types";

export function TaskEditor({
  task,
  busy = false,
  onSave,
  onCancel,
  onDirtyChange,
  draft,
  draftId,
  personal = false,
  onDraftChange,
}: {
  task?: Task;
  personal?: boolean;
  draft?: Partial<Task>;
  draftId?: string;
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
  const [checklist, setChecklist] = useState(
    draft?.checklist ?? task?.checklist ?? [],
  );
  const originalRequest = draft?.original_request ?? task?.original_request;
  const [details, setDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useRef(task?.id || draftId || crypto.randomUUID());
  const submitting = useRef(false);
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const dirty = Boolean(
    title || note || assigned || checklist.length || status !== "pending",
  );
  const checklistChanged =
    JSON.stringify(checklist) !== JSON.stringify(task?.checklist || []);
  const checklistValid = checklist
    .filter((step) => step.title.trim())
    .every((step) => step.title.trim() && step.title.trim().length <= 240);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!onDraftChange) return;
    const changed = !task
      ? dirty
      : title !== task.title ||
        note !== task.note ||
        status !== task.status ||
        assigned !== (task.assigned_to || "") ||
        checklistChanged;
    onDraftChange(
      id.current,
      changed
        ? {
            title,
            note,
            checklist,
            status,
            assigned_to: (assigned as Task["assigned_to"]) || null,
          }
        : null,
    );
  }, [
    task,
    title,
    note,
    status,
    assigned,
    checklist,
    checklistChanged,
    dirty,
    onDraftChange,
  ]);
  const changed =
    !task ||
    title.trim() !== task.title ||
    note.trim() !== task.note ||
    status !== task.status ||
    assigned !== (task.assigned_to || "") ||
    checklistChanged;
  function cancel() {
    cancelled.current = true;
    onCancel();
  }
  function appendStep(afterId?: string) {
    if (checklist.length >= 20) return;
    const step = { id: crypto.randomUUID(), title: "", done: false };
    setChecklist((current) => {
      const index = afterId
        ? current.findIndex((item) => item.id === afterId) + 1
        : current.length;
      return [...current.slice(0, index), step, ...current.slice(index)];
    });
    window.requestAnimationFrame(() =>
      document.getElementById(`step-${step.id}`)?.focus(),
    );
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
        if (title.trim() && checklistValid) event.currentTarget.requestSubmit();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || !checklistValid || locked || submitting.current)
          return;
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
              checklist: checklist
                .filter((step) => step.title.trim())
                .map((step) => ({
                  ...step,
                  title: step.title.trim(),
                })),
              ...(originalRequest !== undefined
                ? { original_request: originalRequest }
                : {}),
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
        onDraftChange?.(id.current, null);
        if (!task) {
          setTitle("");
          setNote("");
          setChecklist([]);
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
          enterKeyHint={task ? "done" : "next"}
          spellCheck
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          required
          readOnly={locked}
        />
        {!task && (
          <button
            className="save-button"
            type="submit"
            disabled={!title.trim() || !checklistValid || locked}
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
          <div className="editor-checklist">
            {checklist.map((step, index) => (
              <div className="editor-step" key={step.id}>
                <input
                  id={`step-${step.id}`}
                  aria-label={`Checklist step ${index + 1}`}
                  enterKeyHint="next"
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!locked && step.title.trim()) appendStep(step.id);
                    }
                  }}
                  placeholder="What needs to happen?"
                  value={step.title}
                  maxLength={240}
                  readOnly={locked}
                  onChange={(event) => {
                    setChecklist((current) =>
                      current.map((item) =>
                        item.id === step.id
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    );
                    setFailed(false);
                  }}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove checklist step ${index + 1}`}
                  disabled={locked}
                  onClick={() =>
                    setChecklist((current) =>
                      current.filter((item) => item.id !== step.id),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={locked || checklist.length >= 20}
              onClick={() => appendStep()}
            >
              <Plus size={14} />
              {checklist.length ? "Add step" : "Add a checklist"}
            </button>
          </div>
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
        {!task && (
          <span className="add-key-hint">Enter to add · Esc to finish</span>
        )}
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
            disabled={
              !title.trim() ||
              !checklistValid ||
              locked ||
              (!changed && !failed)
            }
          >
            {saving ? "Saving…" : failed ? "Retry" : "Save"}
          </button>
        )}
      </div>
    </form>
  );
}
