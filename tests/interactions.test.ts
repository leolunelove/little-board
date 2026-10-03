import { transport } from "../lib/transport";
import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import type { Board, Task } from "../lib/types";

let ui: typeof import("@testing-library/react");
let MemoBoard: typeof import("../components/memo-board").MemoBoard;
let TaskEditor: typeof import("../components/task-editor").TaskEditor;
let useMemoMutations: typeof import("../components/use-memo-mutations").useMemoMutations;
let UNDO_MS: number;
let noteWidth = 250;
const originalFetch = globalThis.fetch;
const stamp = new Date().toISOString();
const task: Task = {
  id: "12345678-1234-4123-8123-123456789012",
  board_id: "12345678-1234-4123-8123-123456789013",
  title: "Finish the film",
  note: "First cut is ready. Review the closing scene before export.",
  status: "pending",
  assigned_to: null,
  sort_order: 1024,
  created_at: stamp,
  updated_at: stamp,
  completed_at: null,
};
const initial: Board = {
  id: task.board_id,
  title: "Shared memo",
  updated_at: stamp,
  tasks: [task],
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

before(async () => {
  transport.request = (...args) => globalThis.fetch(...args);
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://memo.test/",
    pretendToBeVisual: true,
  });
  Object.defineProperty(dom.window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
    "getComputedStyle",
    "localStorage",
  ] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  }
  // jsdom has no layout engine. Supply measured text and line widths, then
  // exercise the same resize/overflow decisions used by the browser.
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return this.classList.contains("note-measure") ? noteWidth : 0;
    },
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get() {
      return this.classList.contains("note-measure")
        ? (this.textContent?.length || 0) * 7
        : 0;
    },
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  ui = await import("@testing-library/react");
  ({ MemoBoard } = await import("../components/memo-board"));
  ({ TaskEditor } = await import("../components/task-editor"));
  ({ useMemoMutations, UNDO_MS } =
    await import("../components/use-memo-mutations"));
});
afterEach(() => {
  ui.cleanup();
  globalThis.fetch = originalFetch;
  localStorage.clear();
  noteWidth = 250;
});

test("quick add retains failed drafts and their UUID, then resets and focuses for the next item", async () => {
  const saves: { patch: Partial<Task>; id: string }[] = [];
  ui.render(
    createElement(TaskEditor, {
      onCancel() {},
      async onSave(patch, id) {
        saves.push({ patch, id });
        return saves.length > 1;
      },
    }),
  );
  const input = ui.screen.getByRole("textbox", {
    name: "Item title",
  }) as HTMLInputElement;
  ui.fireEvent.change(input, { target: { value: "New item" } });
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add details" }));
  ui.fireEvent.change(ui.screen.getByRole("textbox", { name: "Short note" }), {
    target: { value: "Keep this draft" },
  });
  await ui.act(async () => {
    ui.fireEvent.submit(ui.screen.getByRole("form", { name: "Add item" }));
  });
  assert.equal(input.value, "New item");
  assert.equal(
    (
      ui.screen.getByRole("textbox", {
        name: "Short note",
      }) as HTMLTextAreaElement
    ).value,
    "Keep this draft",
  );
  assert.ok(ui.screen.getByRole("button", { name: "Retry" }));
  await ui.act(async () => {
    ui.fireEvent.click(ui.screen.getByRole("button", { name: "Retry" }));
  });
  assert.equal(saves[0].id, saves[1].id);
  assert.equal(saves[1].patch.note, "Keep this draft");
  assert.equal(input.value, "");
  assert.equal(document.activeElement, input);
  ui.fireEvent.change(input, { target: { value: "Another item" } });
  await ui.act(async () => {
    ui.fireEvent.submit(ui.screen.getByRole("form", { name: "Add item" }));
  });
  assert.notEqual(saves[1].id, saves[2].id);
});

test("the dock saves successive items in place and returns focus when finished", async () => {
  const saved: Task[] = [task];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "/api/tasks");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.action, "add");
    saved.push(body.task);
    return response({ ...initial, tasks: [...saved] });
  };
  ui.render(createElement(MemoBoard, { initial, mode: "owner" }));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add item" }));
  const input = ui.screen.getByRole("textbox", {
    name: "Item title",
  }) as HTMLInputElement;
  assert.equal(document.activeElement, input);
  const composer = ui.screen.getByRole("form", { name: "Add item" });
  for (const title of ["First new item", "Second new item"]) {
    ui.fireEvent.change(input, { target: { value: title } });
    await ui.act(async () => {
      ui.fireEvent.submit(composer);
    });
    assert.equal(ui.screen.getByRole("form", { name: "Add item" }), composer);
    assert.equal(input.value, "");
    assert.equal(document.activeElement, input);
    assert.ok(ui.screen.getByRole("button", { name: title }));
    assert.equal(
      ui.screen.getByText("Added to Pending").getAttribute("role"),
      "status",
    );
  }
  assert.equal(saved.length, 3);
  assert.notEqual(saved[1].id, saved[2].id);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Done adding" }));
  assert.equal(ui.screen.queryByRole("form", { name: "Add item" }), null);
  assert.equal(
    document.activeElement,
    ui.screen.getByRole("button", { name: "Add item" }),
  );
});

test("a quick-add draft survives editing another item and cannot be lost by opening Archive", () => {
  ui.render(createElement(MemoBoard, { initial, mode: "owner", demo: true }));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add item" }));
  const input = ui.screen.getByRole("textbox", {
    name: "Item title",
  }) as HTMLInputElement;
  ui.fireEvent.change(input, { target: { value: "Unfinished new item" } });
  assert.equal(
    (ui.screen.getByRole("button", { name: "Archived" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: task.title }));
  assert.equal(ui.screen.queryByRole("form", { name: "Add item" }), null);
  assert.ok(input.isConnected);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Cancel" }));
  assert.equal(ui.screen.getByRole("textbox", { name: "Item title" }), input);
  assert.equal(input.value, "Unfinished new item");
  assert.equal(document.activeElement, input);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Cancel" }));
  assert.equal(
    (ui.screen.getByRole("button", { name: "Archived" }) as HTMLButtonElement)
      .disabled,
    false,
  );
});

test("the composer tracks a phone keyboard and viewport panning without moving for pinch zoom", (t) => {
  const viewport = new window.EventTarget();
  Object.assign(viewport, { height: 400, offsetTop: 0, scale: 1 });
  const originalViewport = Object.getOwnPropertyDescriptor(
    window,
    "visualViewport",
  )!;
  const originalHeight = Object.getOwnPropertyDescriptor(
    window,
    "innerHeight",
  )!;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
  t.after(() => {
    Object.defineProperty(window, "visualViewport", originalViewport);
    Object.defineProperty(window, "innerHeight", originalHeight);
  });
  ui.render(createElement(MemoBoard, { initial, mode: "owner", demo: true }));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add item" }));
  const main = ui.screen.getByRole("main");
  assert.equal(main.style.getPropertyValue("--keyboard-inset"), "400px");
  assert.equal(main.style.getPropertyValue("--composer-viewport"), "400px");
  ui.act(() => {
    Object.assign(viewport, { offsetTop: 50 });
    viewport.dispatchEvent(new window.Event("scroll"));
  });
  assert.equal(main.style.getPropertyValue("--keyboard-inset"), "350px");
  ui.act(() => {
    Object.assign(viewport, { scale: 2 });
    viewport.dispatchEvent(new window.Event("resize"));
  });
  assert.equal(main.style.getPropertyValue("--keyboard-inset"), "0px");
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Done adding" }));
  assert.equal(main.style.getPropertyValue("--composer-viewport"), "100dvh");
});

test("failed inline saves across sections preserve the editor, note, and selected status", async () => {
  let succeeding = false;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return succeeding
      ? response({
          ...initial,
          tasks: [{ ...task, ...body.patch, completed_at: stamp }],
        })
      : response({ error: "Temporary failure" }, 503);
  };
  ui.render(createElement(MemoBoard, { initial, mode: "owner" }));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: task.title }));
  ui.fireEvent.change(ui.screen.getByRole("textbox", { name: "Item title" }), {
    target: { value: "Revised title" },
  });
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add details" }));
  ui.fireEvent.change(ui.screen.getByRole("textbox", { name: "Short note" }), {
    target: { value: "Revised note" },
  });
  ui.fireEvent.change(
    ui.screen.getByRole("combobox", { name: "Item status" }),
    { target: { value: "done" } },
  );
  await ui.act(async () => {
    ui.fireEvent.click(ui.screen.getByRole("button", { name: "Save" }));
  });
  assert.equal(
    (ui.screen.getByRole("textbox", { name: "Item title" }) as HTMLInputElement)
      .value,
    "Revised title",
  );
  assert.equal(
    (
      ui.screen.getByRole("textbox", {
        name: "Short note",
      }) as HTMLTextAreaElement
    ).value,
    "Revised note",
  );
  assert.equal(
    (
      ui.screen.getByRole("combobox", {
        name: "Item status",
      }) as HTMLSelectElement
    ).value,
    "done",
  );
  succeeding = true;
  await ui.act(async () => {
    ui.fireEvent.click(ui.screen.getByRole("button", { name: "Retry" }));
  });
  assert.equal(ui.screen.queryByRole("form", { name: "Edit item" }), null);
  assert.ok(
    ui
      .within(ui.screen.getByRole("region", { name: "Done" }))
      .getByRole("button", { name: "Revised title" }),
  );
  assert.ok(ui.screen.getByRole("button", { name: "Undo" }));
});

test("viewers can expand notes but have no editing, account, add, or drag controls", () => {
  ui.render(createElement(MemoBoard, { initial, mode: "viewer", demo: true }));
  const more = ui.screen.getByRole("button", {
    name: `More detail for ${task.title}`,
  });
  assert.equal(more.getAttribute("aria-expanded"), "false");
  ui.fireEvent.click(more);
  assert.equal(
    ui.screen
      .getByRole("button", { name: `Less detail for ${task.title}` })
      .getAttribute("aria-expanded"),
    "true",
  );
  assert.equal(ui.screen.queryByRole("button", { name: "Add item" }), null);
  assert.equal(ui.screen.queryByRole("button", { name: "Admin menu" }), null);
  assert.equal(
    ui.screen.queryByRole("button", { name: `Complete ${task.title}` }),
    null,
  );
  assert.equal(
    ui.screen.queryByRole("button", { name: `Reorder ${task.title}` }),
    null,
  );
});

test("admin controls live in a small menu beside a separate View board action", () => {
  ui.render(createElement(MemoBoard, { initial, mode: "owner" }));
  assert.ok(ui.screen.getByText("Editing"));
  assert.ok(ui.screen.getByRole("button", { name: "View board" }));
  assert.equal(ui.screen.queryByRole("button", { name: "Sign out" }), null);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Admin menu" }));
  assert.ok(ui.screen.getByRole("button", { name: "Sign out" }));
  assert.ok(ui.screen.getByRole("button", { name: "Share memo" }));
  ui.fireEvent.keyDown(ui.screen.getByRole("button", { name: "Sign out" }), {
    key: "Escape",
  });
  assert.equal(ui.screen.queryByRole("button", { name: "Sign out" }), null);
});

test("Undo cancels staged deletion without an API write, even after a refresh", async () => {
  let writes = 0;
  globalThis.fetch = async () => {
    writes++;
    return response(initial);
  };
  const { result } = ui.renderHook(() => useMemoMutations(initial, false));
  await ui.act(async () => {
    await result.current.remove(task);
  });
  assert.equal(result.current.hiddenTaskId, task.id);
  ui.act(() => {
    result.current.setBoard({ ...initial });
  });
  assert.equal(result.current.hiddenTaskId, task.id);
  await ui.act(async () => {
    await result.current.undoLast();
  });
  assert.equal(result.current.hiddenTaskId, null);
  assert.deepEqual(result.current.board.tasks, [task]);
  assert.equal(writes, 0);
});

test("deletion commits after the Undo window and restores the row on failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let writes = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      writes++;
      return response({ error: "Offline" }, 503);
    }
    return response(initial);
  };
  const { result } = ui.renderHook(() => useMemoMutations(initial, false));
  await ui.act(async () => {
    await result.current.remove(task);
  });
  await ui.act(async () => {
    t.mock.timers.tick(UNDO_MS - 1);
  });
  assert.equal(writes, 0);
  await ui.act(async () => {
    t.mock.timers.tick(1);
  });
  assert.equal(writes, 1);
  assert.equal(result.current.hiddenTaskId, null);
  assert.equal(result.current.board.tasks[0].id, task.id);
  assert.equal(result.current.error, "Offline");
});

test("rapid deletions commit the previous item and leave only the latest undoable", async () => {
  const second = {
    ...task,
    id: "12345678-1234-4123-8123-123456789014",
    title: "Second",
  };
  let server = { ...initial, tasks: [task, second] };
  const deleted: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const { id } = JSON.parse(String(init?.body));
    deleted.push(id);
    server = { ...server, tasks: server.tasks.filter((t) => t.id !== id) };
    return response(server);
  };
  const { result } = ui.renderHook(() => useMemoMutations(server, false));
  await ui.act(async () => {
    await Promise.all([
      result.current.remove(task),
      result.current.remove(second),
    ]);
  });
  assert.deepEqual(deleted, [task.id]);
  assert.equal(result.current.hiddenTaskId, second.id);
  await ui.act(async () => {
    await result.current.undoLast();
  });
  assert.deepEqual(result.current.board.tasks, [second]);
});

test("Undo completion restores its earlier status without overwriting a later text edit", async () => {
  let server = structuredClone(initial);
  globalThis.fetch = async (_url, init) => {
    const { patch } = JSON.parse(String(init?.body));
    server = {
      ...server,
      tasks: server.tasks.map((t) => ({
        ...t,
        ...patch,
        completed_at: patch.status === "done" ? stamp : null,
      })),
    };
    return response(server);
  };
  const { result } = ui.renderHook(() => useMemoMutations(initial, false));
  await ui.act(async () => {
    await result.current.complete(task, "update", {
      id: task.id,
      patch: { status: "done" },
    });
  });
  await ui.act(async () => {
    await result.current.change("update", {
      id: task.id,
      patch: { title: "Updated wording" },
    });
  });
  await ui.act(async () => {
    await result.current.undoLast();
  });
  assert.equal(result.current.board.tasks[0].status, "pending");
  assert.equal(result.current.board.tasks[0].title, "Updated wording");
});

test("a lost add response is reconciled by UUID without creating a duplicate", async () => {
  let writes = 0;
  const added = {
    ...task,
    id: "12345678-1234-4123-8123-123456789015",
    title: "New item",
  };
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "POST") {
      writes++;
      throw new TypeError("Network lost after commit");
    }
    return response({ ...initial, tasks: [task, added] });
  };
  const { result } = ui.renderHook(() => useMemoMutations(initial, false));
  let ok = false;
  await ui.act(async () => {
    ok = await result.current.change("add", { task: added });
  });
  assert.equal(ok, true);
  assert.equal(writes, 1);
  assert.equal(result.current.board.tasks.length, 2);
  assert.equal(result.current.error, "");
});

test("leaving the editor flushes a pending removal before navigation", async () => {
  let writes = 0;
  globalThis.fetch = async () => {
    writes++;
    return response({ ...initial, tasks: [] });
  };
  const { result } = ui.renderHook(() => useMemoMutations(initial, false));
  await ui.act(async () => {
    await result.current.remove(task);
  });
  let ok = false;
  await ui.act(async () => {
    ok = await result.current.settleUndo();
  });
  assert.equal(ok, true);
  assert.equal(writes, 1);
  assert.equal(result.current.undo, null);
  assert.equal(result.current.board.tasks.length, 0);
});

test("viewer starts with the memo title and has a quiet accessible redaction toggle", () => {
  ui.render(createElement(MemoBoard, { initial, mode: "viewer", demo: true }));
  const main = ui.screen.getByRole("main");
  assert.equal(main.firstElementChild?.tagName, "HEADER");
  assert.equal(main.querySelector(".topbar"), null);
  assert.equal(ui.screen.queryByText(/view only/i), null);
  const redaction = ui.screen.getByRole("button", { name: "Redaction effect" });
  assert.equal(redaction.textContent?.trim(), "Redacted");
  assert.equal(redaction.getAttribute("aria-pressed"), "true");
  ui.fireEvent.click(redaction);
  assert.equal(redaction.getAttribute("aria-pressed"), "false");
  assert.equal(redaction.textContent?.trim(), "Redact");
});

test("only clipped notes offer More; tapping the note expands it and resizing reassesses the width", () => {
  const short = {
    ...task,
    id: "12345678-1234-4123-8123-123456789019",
    title: "Short item",
    note: "Ready",
  };
  ui.render(
    createElement(MemoBoard, {
      initial: { ...initial, tasks: [task, short] },
      mode: "viewer",
      demo: true,
    }),
  );
  assert.equal(
    ui.screen.queryByRole("button", { name: "More detail for Short item" }),
    null,
  );
  const more = ui.screen.getByRole("button", {
    name: `More detail for ${task.title}`,
  });
  ui.fireEvent.click(ui.within(more).getByText(task.note));
  assert.equal(
    ui.screen
      .getByRole("button", { name: `Less detail for ${task.title}` })
      .getAttribute("aria-expanded"),
    "true",
  );
  noteWidth = 1000;
  ui.act(() => {
    window.dispatchEvent(new window.Event("resize"));
  });
  assert.equal(ui.screen.queryByRole("button", { name: /detail for/ }), null);
  noteWidth = 250;
  ui.act(() => {
    window.dispatchEvent(new window.Event("resize"));
  });
  assert.equal(
    ui.screen
      .getByRole("button", { name: `Less detail for ${task.title}` })
      .getAttribute("aria-expanded"),
    "true",
  );
});

test("reading choices survive reopening without saving task text, and stay scoped to each board", () => {
  const props = { initial, mode: "viewer" as const };
  const first = ui.render(createElement(MemoBoard, props));
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: `More detail for ${task.title}` }),
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Done" }));
  first.unmount();
  const storage = Array.from({ length: localStorage.length }, (_, i) =>
    localStorage.getItem(localStorage.key(i)!),
  ).join("");
  assert.ok(storage.includes(task.id));
  assert.ok(!storage.includes(task.title) && !storage.includes(task.note));
  const second = ui.render(createElement(MemoBoard, props));
  assert.equal(
    ui.screen
      .getByRole("button", { name: "Done" })
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    ui.screen
      .getByRole("button", { name: `Less detail for ${task.title}` })
      .getAttribute("aria-expanded"),
    "true",
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: `Less detail for ${task.title}` }),
  );
  second.unmount();
  const third = ui.render(createElement(MemoBoard, props));
  assert.equal(
    ui.screen
      .getByRole("button", { name: `More detail for ${task.title}` })
      .getAttribute("aria-expanded"),
    "false",
  );
  third.unmount();
  const other = ui.render(
    createElement(MemoBoard, {
      initial: { ...initial, id: "another-board" },
      mode: "viewer",
    }),
  );
  assert.equal(
    ui.screen
      .getByRole("button", { name: "Done" })
      .getAttribute("aria-expanded"),
    "true",
  );
  other.unmount();
  ui.render(createElement(MemoBoard, { ...props, demo: true }));
  assert.equal(
    ui.screen
      .getByRole("button", { name: "Done" })
      .getAttribute("aria-expanded"),
    "true",
  );
});

test("blocked preference storage still permits expanding notes and toggling Done", (t) => {
  const storage = Object.getPrototypeOf(localStorage);
  t.mock.method(storage, "getItem", () => {
    throw new Error("Storage blocked");
  });
  t.mock.method(storage, "setItem", () => {
    throw new Error("Storage blocked");
  });
  ui.render(createElement(MemoBoard, { initial, mode: "viewer", demo: true }));
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: `More detail for ${task.title}` }),
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Done" }));
  assert.equal(
    ui.screen
      .getByRole("button", { name: "Done" })
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.ok(
    ui.screen.getByRole("button", { name: `Less detail for ${task.title}` }),
  );
});

test("Edit is tucked into the footer, away from the reading header", () => {
  ui.render(createElement(MemoBoard, { initial, mode: "viewer" }));
  assert.equal(
    ui.screen.getByRole("link", { name: "Edit memo" }).getAttribute("href"),
    "/admin",
  );
  const edit = ui.screen.getByRole("link", { name: "Edit memo" });
  assert.ok(edit.closest("footer"));
  assert.equal(edit.closest("header"), null);
  assert.ok(
    ui
      .within(ui.screen.getByRole("contentinfo"))
      .getByRole("group", { name: "Appearance" }),
  );
  assert.equal(ui.screen.queryByRole("textbox", { name: "Board title" }), null);
  assert.equal(ui.screen.queryByRole("button", { name: "Add item" }), null);
  assert.equal(
    ui.screen.queryByRole("button", { name: `Reorder ${task.title}` }),
    null,
  );
});

test("row menus close outside or with Escape, restore focus, and disable unavailable moves", () => {
  ui.render(createElement(MemoBoard, { initial, mode: "owner", demo: true }));
  const options = ui.screen.getByRole("button", {
    name: `Options for ${task.title}`,
  });
  ui.fireEvent.click(options);
  assert.equal(
    (ui.screen.getByRole("button", { name: "Move up" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  assert.equal(
    (ui.screen.getByRole("button", { name: "Move down" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  ui.fireEvent.keyDown(ui.screen.getByRole("button", { name: "Delete item" }), {
    key: "Escape",
  });
  assert.equal(ui.screen.queryByRole("button", { name: "Delete item" }), null);
  assert.equal(document.activeElement, options);
  ui.fireEvent.click(options);
  ui.fireEvent.pointerDown(document.body);
  assert.equal(ui.screen.queryByRole("button", { name: "Delete item" }), null);
});

test("switching tasks keeps an unsaved edit and Cancel deliberately discards it", () => {
  const second = {
    ...task,
    id: "12345678-1234-4123-8123-123456789018",
    title: "Second item",
  };
  ui.render(
    createElement(MemoBoard, {
      initial: { ...initial, tasks: [task, second] },
      mode: "owner",
      demo: true,
    }),
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: task.title }));
  ui.fireEvent.change(ui.screen.getByRole("textbox", { name: "Item title" }), {
    target: { value: "Unfinished wording" },
  });
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add details" }));
  ui.fireEvent.change(ui.screen.getByRole("textbox", { name: "Short note" }), {
    target: { value: "Keep this detail" },
  });
  ui.fireEvent.change(
    ui.screen.getByRole("combobox", { name: "Item status" }),
    { target: { value: "waiting" } },
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Second item" }));
  assert.ok(ui.screen.getByText("Unsaved edit"));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: task.title }));
  assert.equal(
    (ui.screen.getByRole("textbox", { name: "Item title" }) as HTMLInputElement)
      .value,
    "Unfinished wording",
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Add details" }));
  assert.equal(
    (
      ui.screen.getByRole("textbox", {
        name: "Short note",
      }) as HTMLTextAreaElement
    ).value,
    "Keep this detail",
  );
  assert.equal(
    (
      ui.screen.getByRole("combobox", {
        name: "Item status",
      }) as HTMLSelectElement
    ).value,
    "waiting",
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Cancel" }));
  assert.equal(ui.screen.queryByText("Unsaved edit"), null);
  ui.fireEvent.click(ui.screen.getByRole("button", { name: task.title }));
  assert.equal(
    (ui.screen.getByRole("textbox", { name: "Item title" }) as HTMLInputElement)
      .value,
    task.title,
  );
});

test("inline title saves on leaving the form, ignores internal focus, and Escape cancels", async () => {
  const saves: Partial<Task>[] = [];
  let cancelled = 0;
  ui.render(
    createElement(TaskEditor, {
      task,
      onCancel() {
        cancelled++;
      },
      async onSave(patch) {
        saves.push(patch);
        return true;
      },
    }),
  );
  const input = ui.screen.getByRole("textbox", { name: "Item title" });
  assert.equal(ui.screen.queryByRole("textbox", { name: "Short note" }), null);
  ui.fireEvent.change(input, { target: { value: "Edited inline" } });
  ui.fireEvent.blur(input, {
    relatedTarget: ui.screen.getByRole("button", { name: "Add details" }),
  });
  assert.equal(saves.length, 0);
  await ui.act(async () => {
    ui.fireEvent.blur(input, { relatedTarget: document.body });
  });
  assert.equal(saves.length, 1);
  assert.equal(saves[0].title, "Edited inline");
  ui.fireEvent.change(input, { target: { value: "Discard me" } });
  ui.fireEvent.keyDown(input, { key: "Escape" });
  ui.fireEvent.blur(input, { relatedTarget: document.body });
  assert.equal(cancelled, 1);
  assert.equal(saves.length, 1);
});

test("unchanged edits stay quiet and a corrected failed draft saves with the keyboard", async () => {
  let attempts = 0;
  const patches: Partial<Task>[] = [];
  ui.render(
    createElement(TaskEditor, {
      task,
      onCancel() {},
      async onSave(patch) {
        attempts++;
        patches.push(patch);
        return attempts > 1;
      },
    }),
  );
  const input = ui.screen.getByRole("textbox", { name: "Item title" });
  assert.equal(
    (ui.screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  ui.fireEvent.change(input, { target: { value: task.title + " " } });
  assert.equal(
    (ui.screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  ui.fireEvent.change(input, { target: { value: "First attempt" } });
  await ui.act(async () => {
    ui.fireEvent.keyDown(input, { key: "Enter", metaKey: true });
  });
  assert.ok(ui.screen.getByRole("button", { name: "Retry" }));
  ui.fireEvent.change(input, { target: { value: "Corrected wording" } });
  await ui.act(async () => {
    ui.fireEvent.blur(input, { relatedTarget: document.body });
  });
  assert.equal(attempts, 2);
  assert.equal(patches[1].title, "Corrected wording");
});
