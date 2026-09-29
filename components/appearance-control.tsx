"use client";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  APPEARANCE_KEY,
  applyAppearance,
  savedAppearance,
  validAppearance,
  type Appearance,
} from "@/lib/appearance";

export function AppearanceControl() {
  const [appearance, setAppearance] = useState<Appearance>("light");
  const chosen = useRef<Appearance | null>(null);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    chosen.current = savedAppearance();
    const sync = () => {
      const next = chosen.current ?? (media?.matches ? "night" : "light");
      setAppearance(next);
      applyAppearance(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== APPEARANCE_KEY) return;
      chosen.current = validAppearance(event.newValue);
      sync();
    };
    sync();
    media?.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      if (transitionTimer.current !== null)
        window.clearTimeout(transitionTimer.current);
      document.documentElement.classList.remove("theme-changing");
      media?.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function choose(next: Appearance) {
    if (next === appearance) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("theme-changing");
      // Let the transition rule take effect before changing the theme tokens.
      void document.documentElement.offsetWidth;
      if (transitionTimer.current !== null)
        window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(() => {
        document.documentElement.classList.remove("theme-changing");
        transitionTimer.current = null;
      }, 220);
    }
    chosen.current = next;
    setAppearance(next);
    applyAppearance(next);
    try {
      localStorage.setItem(APPEARANCE_KEY, next);
    } catch {
      /* Retain the choice for this visit if storage is blocked. */
    }
  }

  return (
    <div className="appearance-control" role="group" aria-label="Appearance">
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={appearance === "light"}
        onClick={() => choose("light")}
      >
        <Sun size={13} aria-hidden="true" />
        Light
      </button>
      <button
        type="button"
        aria-label="Night mode"
        aria-pressed={appearance === "night"}
        onClick={() => choose("night")}
      >
        <Moon size={13} aria-hidden="true" />
        Night
      </button>
    </div>
  );
}
