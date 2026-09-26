import { test } from "node:test";
import assert from "node:assert/strict";
import { isArchived, ARCHIVE_AFTER_MS } from "../lib/archive";
test("Only completed items older than 24 hours are archived", () => {
  const now = Date.parse("2026-09-23T14:00:00Z");
  assert.equal(
    isArchived(
      {
        status: "done",
        completed_at: new Date(now - ARCHIVE_AFTER_MS + 1).toISOString(),
      },
      now,
    ),
    false,
  );
  assert.equal(
    isArchived(
      {
        status: "done",
        completed_at: new Date(now - ARCHIVE_AFTER_MS).toISOString(),
      },
      now,
    ),
    true,
  );
  assert.equal(
    isArchived(
      {
        status: "done",
        completed_at: new Date(now - 2 * ARCHIVE_AFTER_MS).toISOString(),
      },
      now,
    ),
    true,
  );
  assert.equal(
    isArchived({ status: "pending", completed_at: null }, now),
    false,
  );
  assert.equal(
    isArchived(
      {
        status: "waiting",
        completed_at: new Date(now - 2 * ARCHIVE_AFTER_MS).toISOString(),
      },
      now,
    ),
    false,
  );
  assert.equal(isArchived({ status: "done", completed_at: null }, now), false);
});
