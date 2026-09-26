"use client";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

export function useComposerDock(visible: boolean, composing: boolean) {
  const dockRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(54);
  const [viewport, setViewport] = useState({ inset: 0, height: 0 });

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!visible || !dock) return;
    const measure = () => {
      if (dock.offsetHeight) setHeight(dock.offsetHeight);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(dock);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [visible, composing]);

  useLayoutEffect(() => {
    if (!visible || !composing) return;
    const view = window.visualViewport;
    const sync = () => {
      // A virtual keyboard shrinks the visual viewport on iOS. Ignore pinch
      // zoom so the composer remains part of the page while magnified.
      const available = view?.scale === 1 ? view : null;
      setViewport({
        inset: available
          ? Math.max(
              0,
              window.innerHeight - available.height - available.offsetTop,
            )
          : 0,
        height: available?.height || window.innerHeight,
      });
    };
    sync();
    view?.addEventListener("resize", sync);
    view?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      view?.removeEventListener("resize", sync);
      view?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [visible, composing]);

  const style = {
    "--dock-height": `${height}px`,
    "--keyboard-inset": `${visible && composing ? viewport.inset : 0}px`,
    "--composer-viewport":
      visible && composing && viewport.height
        ? `${viewport.height}px`
        : "100dvh",
  } as CSSProperties;
  return { dockRef, style };
}
