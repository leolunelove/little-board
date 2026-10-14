"use client";
import { useState, useRef } from "react";
import { Settings2 } from "lucide-react";
import { AppearanceControl } from "./appearance-control";
import { iconKey } from "./board-icon";
import { Sheet } from "./sheet";
export function ProfileSettings({ boardId }: { boardId?: string }) {
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(false);
  const svgInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-button profile-settings"
        aria-label="Profile settings"
        onClick={() => setOpen(true)}
      >
        <Settings2 size={15} /> Settings
      </button>
      {open && (
        <Sheet title="Your preferences" onClose={() => setOpen(false)}>
          <p className="settings-copy">
            A comfortable place to keep track of things.
          </p>
          <h3>Appearance</h3>
          <AppearanceControl />
          <p className="attachment-hint">
            Your choice is remembered on this device.
          </p>
          {boardId && (
            <>
              <h3>Board icon</h3>
              <button
                type="button"
                className="text-button"
                onClick={() => svgInput.current?.click()}
              >
                Choose an SVG
              </button>
              <>
                <input
                  ref={svgInput}
                  hidden
                  aria-label="Choose SVG file"
                  type="file"
                  accept="image/svg+xml,.svg"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 32768)
                        throw new Error("Choose an SVG under 32 KB.");
                      const text = await file.text();
                      const doc = new DOMParser().parseFromString(
                        text,
                        "image/svg+xml",
                      );
                      if (
                        doc.documentElement.localName !== "svg" ||
                        doc.querySelector(
                          "parsererror,script,foreignObject,style",
                        ) ||
                        Array.from(doc.querySelectorAll("*")).some((element) =>
                          Array.from(element.attributes).some(
                            (attr) =>
                              /^on/i.test(attr.name) ||
                              (/href$/.test(attr.name) &&
                                !attr.value.startsWith("#")),
                          ),
                        )
                      )
                        throw new Error("Choose a self-contained SVG icon.");
                      localStorage.setItem(
                        iconKey(boardId),
                        "data:image/svg+xml," + encodeURIComponent(text),
                      );
                      window.dispatchEvent(new Event("board-icon"));
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                    event.target.value = "";
                  }}
                />
              </>
              <button
                className="text-button"
                onClick={() => {
                  localStorage.removeItem(iconKey(boardId));
                  window.dispatchEvent(new Event("board-icon"));
                }}
              >
                Reset icon
              </button>
              <p className="attachment-hint">
                The icon is saved only in this browser.
              </p>
              {error && <p role="alert">{error}</p>}
            </>
          )}
          <button
            className="text-button"
            aria-expanded={notes}
            onClick={() => setNotes(!notes)}
          >
            What’s new
          </button>
          {notes && (
            <div className="release-notes">
              <h3>14 October 2026</h3>
              <ul>
                <li>
                  Paste images into an item. Images are automatically resized
                  and compressed.
                </li>
                <li>Add a checklist directly from the item editor.</li>
                <li>
                  A brighter default look, with appearance choices in Settings.
                </li>
                <li>Add a short board description and a local SVG icon.</li>
              </ul>
              <h3>9 October 2026</h3>
              <p>
                All items brings your boards into one working list, with search,
                filters, editing and a quick way back to each board.
              </p>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
