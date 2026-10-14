"use client";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { menuPlacement } from "@/lib/menu-position";
export function useMenuPosition(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  parent: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = anchor.current,
        container = parent.current,
        popup = menu.current;
      if (!button || !container || !popup) return;
      // Settle a moving row before anchoring a popup to it.
      container
        .closest(".task-row")
        ?.getAnimations?.()
        .forEach((animation) => animation.cancel());
      const rect = button.getBoundingClientRect(),
        box = container.getBoundingClientRect();
      const view = window.visualViewport;
      const top = view?.scale === 1 ? view.offsetTop : 0;
      const height = view?.scale === 1 ? view.height : window.innerHeight;
      if (rect.bottom < top || rect.top > top + height) {
        close.current();
        return;
      }
      const placement = menuPlacement(
        rect.top,
        rect.bottom,
        Math.max(popup.scrollHeight, popup.offsetHeight),
        top,
        height,
      );
      popup.style.top = placement.up
        ? "auto"
        : `${rect.bottom - box.top + 4}px`;
      popup.style.bottom = placement.up
        ? `${box.bottom - rect.top + 4}px`
        : "auto";
      popup.style.maxHeight = `${placement.maxHeight}px`;
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  });
}
