"use client";
import { Check, ChevronDown } from "lucide-react";
import type { Task } from "@/lib/types";
import { RedactedText } from "./redacted-text";
export function TaskChecklist({
  task,
  writable,
  busy,
  onSave,
}: {
  task: Task;
  writable: boolean;
  busy: boolean;
  onSave: (patch: Partial<Task>) => Promise<boolean>;
}) {
  const steps = task.checklist || [];
  const completed = steps.filter((item) => item.done).length;
  return (
    <>
      {steps.length > 0 && (
        <details className="task-checklist">
          <summary>
            <ChevronDown size={13} />
            <span>
              {completed} of {steps.length} done
            </span>
            <span className="checklist-meter" aria-hidden="true">
              <span style={{ width: `${(completed / steps.length) * 100}%` }} />
            </span>
          </summary>
          <ul>
            {steps.map((step) => (
              <li key={step.id} className={step.done ? "step-done" : ""}>
                {writable ? (
                  <label className="checklist-step">
                    <input
                      type="checkbox"
                      aria-label={`Complete step: ${step.title}`}
                      checked={step.done}
                      disabled={busy}
                      onChange={() =>
                        void onSave({
                          checklist: steps.map((item) =>
                            item.id === step.id
                              ? { ...item, done: !item.done }
                              : item,
                          ),
                        })
                      }
                    />
                    <span className="step-circle" aria-hidden="true">
                      {step.done && <Check size={11} />}
                    </span>
                    <span>
                      <RedactedText>{step.title}</RedactedText>
                    </span>
                  </label>
                ) : (
                  <span className="checklist-step">
                    <span
                      className="step-circle"
                      aria-label={step.done ? "Completed step" : "Pending step"}
                    >
                      {step.done && <Check size={11} />}
                    </span>
                    <span>
                      <RedactedText>{step.title}</RedactedText>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {completed === steps.length && task.status !== "done" && (
            <p className="caption">
              All steps done.
              {writable ? " Complete the item when you’re ready." : ""}
            </p>
          )}
        </details>
      )}
      {task.original_request && (
        <details className="original-request">
          <summary>Original message</summary>
          <p>
            <RedactedText>{task.original_request}</RedactedText>
          </p>
        </details>
      )}
    </>
  );
}
