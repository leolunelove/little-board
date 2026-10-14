"use client";
import { useEffect, useState } from "react";
export const iconKey = (id: string) => `little-board:icon:${id}`;
export function BoardIcon({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setSrc(localStorage.getItem(iconKey(id)));
      } catch {}
    };
    read();
    window.addEventListener("board-icon", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("board-icon", read);
      window.removeEventListener("storage", read);
    };
  }, [id]);
  return src ? (
    <img className="custom-board-icon" src={src} alt="" />
  ) : (
    <span aria-hidden="true">≡</span>
  );
}
