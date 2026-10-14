"use client";
import { useEffect } from "react";
// Keep only a reading position in this tab; board content never goes here.
export function useBoardPosition(id: string, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const key = `memo:position:${id}`;
    let frame = 0,
      restore = 0,
      ready = false;
    let position = 0;
    const save = () => {
      if (!ready) return;
      try {
        sessionStorage.setItem(key, String(position));
      } catch {}
    };
    const leave = () => {
      save();
      ready = false;
    };
    const scroll = () => {
      if (!ready) return;
      position = window.scrollY;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(save);
    };
    let top = 0;
    try {
      const value = Number(sessionStorage.getItem(key));
      if (Number.isFinite(value) && value > 0) top = value;
    } catch {}
    position = top;
    restore = window.requestAnimationFrame(() => {
      restore = window.requestAnimationFrame(() => {
        if (top) window.scrollTo?.({ top, behavior: "instant" });
        ready = true;
      });
    });
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", save);
    window.addEventListener("popstate", leave);
    return () => {
      save();
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(restore);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", save);
      window.removeEventListener("popstate", leave);
    };
  }, [id, enabled]);
}
