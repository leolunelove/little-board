"use client";
import { useCallback, useRef, useState, type SetStateAction } from "react";

// Per-tab recovery avoids retaining another person's text across browser sessions.
export function useSessionDraft<T>(key: string, fallback: T, enabled = true) {
  const [value, setValue] = useState<T>(() => {
    if (!enabled || typeof window === "undefined") return fallback;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(key) || "null");
      if (saved?.version !== 1 || saved.value === undefined) return fallback;
      if (
        fallback !== null &&
        typeof fallback === "object" &&
        (!saved.value ||
          typeof saved.value !== "object" ||
          Array.isArray(saved.value))
      )
        return fallback;
      return saved.value;
    } catch {
      return fallback;
    }
  });
  const current = useRef(value);
  const remember = useCallback(
    (next: SetStateAction<T>) => {
      const result =
        typeof next === "function"
          ? (next as (value: T) => T)(current.current)
          : next;
      current.current = result;
      setValue(result);
      if (!enabled) return;
      try {
        window.sessionStorage.setItem(
          key,
          JSON.stringify({ version: 1, value: result }),
        );
      } catch {
        /* Editing still works when storage is blocked. */
      }
    },
    [key, enabled],
  );
  return [value, remember] as const;
}
