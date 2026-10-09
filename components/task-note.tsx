"use client";
import { useLayoutEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types";
import { RedactedText } from "@/components/redacted-text";

export function TaskNote({
  task,
  expanded,
  onToggle,
  compact = false,
}: {
  task: Pick<Task, "id" | "title" | "note">;
  compact?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const measurement = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const node = measurement.current;
      if (node && node.clientWidth > 0)
        setOverflows(node.scrollWidth > node.clientWidth + 1);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (container.current) observer?.observe(container.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [task.note]);

  const open = expanded && (overflows || compact);
  const text = (
    <span className="task-note" id={`note-${task.id}`}>
      <RedactedText>{task.note}</RedactedText>
    </span>
  );
  if (compact)
    return (
      <div className="list-note">
        <button
          type="button"
          className="text-button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={`note-${task.id}`}
          aria-label={`${expanded ? "Hide" : "Show"} note for ${task.title}`}
        >
          {expanded ? "Hide note" : "Note"}
        </button>
        {expanded && text}
      </div>
    );
  return (
    <div ref={container} className={`task-note-line${open ? " expanded" : ""}`}>
      {/* Measure the entire available line, without the More control taking space.
        Keeping this independent of expansion avoids resize feedback loops. */}
      <span
        ref={measurement}
        className="task-note note-measure"
        aria-hidden="true"
      >
        {task.note}
      </span>
      {overflows ? (
        <button
          type="button"
          className="note-disclosure"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`note-${task.id}`}
          aria-label={`${open ? "Less" : "More"} detail for ${task.title}`}
        >
          {text}
          <span className="note-toggle" aria-hidden="true">
            {open ? "Less" : "More"}
          </span>
        </button>
      ) : (
        text
      )}
    </div>
  );
}
