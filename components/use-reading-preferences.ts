"use client";
import { useEffect, useRef, useState } from "react";

type Preferences = { collapsed: boolean; expandedNotes: string[] };
const defaults: Preferences = { collapsed: false, expandedNotes: [] };

export function useReadingPreferences(boardId: string, demo: boolean) {
  const key = `memo:reading:v1:${demo ? "preview:" : ""}${boardId}`;
  const [preferences, setPreferences] = useState(defaults);
  const current = useRef(defaults);

  useEffect(() => {
    let next = defaults;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && typeof saved === "object") {
        next = {
          collapsed: saved.collapsed === true,
          expandedNotes: Array.isArray(saved.expandedNotes)
            ? saved.expandedNotes
                .filter(
                  (id: unknown): id is string =>
                    typeof id === "string" && id.length <= 100,
                )
                .slice(-500)
            : [],
        };
      }
    } catch {
      // Reading still works with blocked storage or an outdated preference.
    }
    current.current = next;
    setPreferences(next);
  }, [key]);

  function remember(next: Preferences) {
    current.current = next;
    setPreferences(next);
    try {
      // Store only display preferences and IDs, never task text or credentials.
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Keep the choice for this visit when storage is unavailable.
    }
  }

  return {
    ...preferences,
    toggleDone() {
      remember({ ...current.current, collapsed: !current.current.collapsed });
    },
    toggleNote(id: string) {
      const notes = current.current.expandedNotes;
      remember({
        ...current.current,
        expandedNotes: notes.includes(id)
          ? notes.filter((noteId) => noteId !== id)
          : [...notes, id].slice(-500),
      });
    },
  };
}
