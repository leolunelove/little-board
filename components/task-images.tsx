"use client";
import { useState } from "react";
import type { TaskImage } from "@/lib/types";
import { Sheet } from "./sheet";
export function TaskImages({
  images = [],
  onRemove,
}: {
  images?: TaskImage[];
  onRemove?: (id: string) => void;
}) {
  const [selected, setSelected] = useState<TaskImage | null>(null);
  if (!images.length) return null;
  return (
    <>
      <div className="task-images">
        {images.map((image) => (
          <div className="task-image" key={image.id}>
            <button
              type="button"
              className="image-preview"
              aria-label={`Open image: ${image.name}`}
              onClick={() => setSelected(image)}
            >
              <img src={image.src} alt={image.name} loading="lazy" />
            </button>
            {onRemove && (
              <button
                type="button"
                className="image-remove"
                aria-label={`Remove image: ${image.name}`}
                onClick={() => onRemove(image.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {selected && (
        <Sheet title={selected.name} onClose={() => setSelected(null)}>
          <img className="image-full" src={selected.src} alt={selected.name} />
        </Sheet>
      )}
    </>
  );
}
