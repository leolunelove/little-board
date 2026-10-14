"use client";
import { useRef, useState } from "react";
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
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const index = images.findIndex((image) => image.id === selected?.id);
  function next(offset: number) {
    if (index >= 0)
      setSelected(images[(index + offset + images.length) % images.length]);
  }
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
        <Sheet
          title={selected.name}
          onClose={() => setSelected(null)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              next(1);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              next(-1);
            }
          }}
        >
          <div
            className="image-stage"
            onPointerDown={(event) => {
              if (event.pointerType === "touch") {
                gesture.current = gesture.current
                  ? null
                  : { x: event.clientX, y: event.clientY, id: event.pointerId };
                try {
                  event.currentTarget.setPointerCapture?.(event.pointerId);
                } catch {}
              }
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
            onPointerUp={(event) => {
              const start = gesture.current;
              gesture.current = null;
              if (!start || start.id !== event.pointerId) return;
              const x = event.clientX - start.x,
                y = event.clientY - start.y;
              if (y > 90 && y > Math.abs(x) * 1.4) setSelected(null);
              else if (
                Math.abs(x) > 60 &&
                Math.abs(x) > Math.abs(y) * 1.4 &&
                images.length > 1
              )
                next(x < 0 ? 1 : -1);
            }}
          >
            <img
              className="image-full"
              src={selected.src}
              alt={selected.name}
              draggable={false}
            />
          </div>
          {images.length > 1 && (
            <div className="image-navigation">
              <button
                type="button"
                className="text-button"
                onClick={() => next(-1)}
                aria-label="Previous image"
              >
                ←
              </button>
              <span role="status">
                {index + 1} of {images.length}
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => next(1)}
                aria-label="Next image"
              >
                →
              </button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
