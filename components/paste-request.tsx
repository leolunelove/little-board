"use client";
import { useRef, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Sheet } from "./sheet";
import { splitRequest } from "@/lib/paste-request";
import type { Task } from "@/lib/types";

export type ImportedItem = Pick<
  Task,
  "id" | "title" | "checklist" | "original_request"
>;
export function PasteRequest({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (items: ImportedItem[]) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<{ id: string; title: string }[] | null>(
    null,
  );
  const [grouped, setGrouped] = useState(false);
  const [heading, setHeading] = useState("");
  const [keepSource, setKeepSource] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const groupId = useRef(crypto.randomUUID());
  const valid = Boolean(
    items?.length &&
    items.length <= 20 &&
    items.every(
      (item) => item.title.trim() && item.title.trim().length <= 240,
    ) &&
    (!grouped || (heading.trim() && heading.trim().length <= 240)),
  );
  return (
    <Sheet
      title={items ? "Review your items" : "Paste a request"}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      {!items ? (
        <form
          className="paste-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            const result = splitRequest(text);
            setHeading(result.heading);
            setItems(
              result.items.map((title) => ({ id: crypto.randomUUID(), title })),
            );
            setError("");
          }}
        >
          <p>
            Paste a message or a list of changes. You’ll review everything
            before it goes on your board.
          </p>
          <textarea
            autoFocus
            aria-label="Client request"
            placeholder={
              "Menu changes:\n• Update the prices\n• Replace the cover photo\n• Export a print-ready PDF"
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={4000}
            rows={8}
            required
          />
          <span className="caption">
            Lists and line breaks work best. No AI service is used.
          </span>
          <button
            className="primary-action"
            type="submit"
            disabled={!text.trim()}
          >
            Review items
          </button>
        </form>
      ) : (
        <form
          className="paste-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!valid || saving) return;
            setSaving(true);
            setError("");
            const source = keepSource ? { original_request: text.trim() } : {};
            const drafts: ImportedItem[] = grouped
              ? [
                  {
                    id: groupId.current,
                    title: heading.trim(),
                    checklist: items.map((item) => ({
                      id: item.id,
                      title: item.title.trim(),
                      done: false,
                    })),
                    ...source,
                  },
                ]
              : items.map((item) => ({
                  ...item,
                  title: item.title.trim(),
                  ...source,
                }));
            try {
              if (await onAdd(drafts)) onClose();
              else
                setError(
                  "Couldn’t add these yet. Your changes are still here—try again.",
                );
            } catch {
              setError(
                "Couldn’t add these yet. Your changes are still here—try again.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          <p>
            Keep each change separate, or group them into one task with a
            checklist. Edit the wording below.
          </p>
          <div
            className="import-choice"
            role="group"
            aria-label="How to add these items"
          >
            <button
              type="button"
              aria-pressed={!grouped}
              disabled={saving}
              onClick={() => setGrouped(false)}
            >
              Separate tasks
            </button>
            <button
              type="button"
              aria-pressed={grouped}
              disabled={saving}
              onClick={() => setGrouped(true)}
            >
              One checklist
            </button>
          </div>
          {grouped && (
            <label className="import-heading">
              Task name
              <input
                autoFocus
                aria-label="Checklist task name"
                placeholder="e.g. Menu revisions"
                value={heading}
                maxLength={240}
                readOnly={saving}
                onChange={(event) => setHeading(event.target.value)}
                required
              />
            </label>
          )}
          <div className="import-items">
            {items.map((item, index) => (
              <div className="import-item" key={item.id}>
                <span className="import-index" aria-hidden="true">
                  {index + 1}
                </span>
                <textarea
                  aria-label={`Suggested item ${index + 1}`}
                  value={item.title}
                  rows={2}
                  readOnly={saving}
                  onChange={(event) =>
                    setItems((current) =>
                      current!.map((row) =>
                        row.id === item.id
                          ? { ...row, title: event.target.value }
                          : row,
                      ),
                    )
                  }
                  required
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove suggested item ${index + 1}`}
                  disabled={saving}
                  onClick={() =>
                    setItems((current) =>
                      current!.filter((row) => row.id !== item.id),
                    )
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          {items.length > 20 && (
            <p className="draft-error" role="alert">
              Use up to 20 items per paste. Remove or combine some before
              adding.
            </p>
          )}
          {items.some((item) => item.title.trim().length > 240) && (
            <p className="draft-error" role="alert">
              Shorten each item to 240 characters. The original message can stay
              attached.
            </p>
          )}
          <button
            type="button"
            className="text-button"
            disabled={saving || items.length >= 20}
            onClick={() =>
              setItems((current) => [
                ...current!,
                { id: crypto.randomUUID(), title: "" },
              ])
            }
          >
            <Plus size={14} />
            Add a step
          </button>
          <label className="source-choice">
            <input
              type="checkbox"
              checked={keepSource}
              disabled={saving}
              onChange={(event) => setKeepSource(event.target.checked)}
            />
            Keep the original message tucked below
          </label>
          {error && (
            <p role="alert" className="draft-error">
              {error}
            </p>
          )}
          <div className="import-bottom">
            <button
              type="button"
              className="text-button"
              disabled={saving}
              onClick={() => {
                setItems(null);
                setError("");
              }}
            >
              <ArrowLeft size={14} />
              Back to message
            </button>
            <button
              type="submit"
              className="primary-action"
              disabled={!valid || saving}
            >
              {saving
                ? "Adding…"
                : grouped
                  ? "Add checklist"
                  : `Add ${items.length} ${items.length === 1 ? "item" : "items"}`}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
