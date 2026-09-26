import { transport } from "../lib/transport";
import { before, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import type { Board, Task } from "../lib/types";

let ui: typeof import("@testing-library/react");
let MemoBoard: typeof import("../components/memo-board").MemoBoard;
const originalFetch = globalThis.fetch;
const stamp = new Date().toISOString();
const tasks: Task[] = ["Alpha", "Bravo", "Charlie"].map((title, index) => ({
  id: `12345678-1234-4123-8123-12345678901${index}`,
  board_id: "board",
  title,
  note: "",
  status: "pending",
  assigned_to: null,
  sort_order: index * 1024,
  created_at: stamp,
  updated_at: stamp,
  completed_at: null,
}));
const initial: Board = { id: "board", title: "Memo", updated_at: stamp, tasks };
const frame = () => new Promise((resolve) => setTimeout(resolve, 35));

before(async () => {
  transport.request = (...args) => globalThis.fetch(...args);
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://memo.test",
    pretendToBeVisual: true,
  });
  class Pointer extends dom.window.MouseEvent {
    readonly isPrimary: boolean;
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.isPrimary = init.isPrimary ?? true;
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  Object.defineProperty(dom.window, "PointerEvent", { value: Pointer });
  Object.defineProperty(dom.window, "innerHeight", { value: 1200 });
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
    "PointerEvent",
    "KeyboardEvent",
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  });
  // Supply deterministic row/section geometry because jsdom does not lay out CSS.
  // Pointer, keyboard sensors, collision detection and state transitions are real.
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (
      this.matches(".drag-preview") ||
      (this.style.position === "fixed" && this.querySelector(".drag-preview"))
    )
      return new dom.window.DOMRect(25, 224, 550, 80);
    const section = this.closest(".task-section");
    let top = 180;
    if (section) {
      for (const sibling of document.querySelectorAll(".task-section")) {
        if (sibling === section) break;
        top +=
          44 +
          Math.max(1, sibling.querySelectorAll(".task-row").length) * 80 +
          24;
      }
      const row = this.closest(".task-row");
      if (row) {
        const index = Array.from(section.querySelectorAll(".task-row")).indexOf(
          row,
        );
        return new dom.window.DOMRect(25, top + 44 + index * 80, 550, 80);
      }
      return new dom.window.DOMRect(
        25,
        top,
        550,
        44 + Math.max(1, section.querySelectorAll(".task-row").length) * 80,
      );
    }
    return new dom.window.DOMRect(0, 0, 600, 1200);
  };
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 600;
    },
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 1200;
    },
  });
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return 1200;
    },
  });
  ui = await import("@testing-library/react");
  ({ MemoBoard } = await import("../components/memo-board"));
});
afterEach(() => {
  ui.cleanup();
  localStorage.clear();
  globalThis.fetch = originalFetch;
});

function setup() {
  let server = structuredClone(initial);
  const requests: string[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push(String(url));
    if (init?.body) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.action, "reorder");
      server = {
        ...server,
        tasks: server.tasks.map((task) => ({
          ...task,
          ...body.items.find((item: Task) => item.id === task.id),
        })),
      };
    }
    return new Response(JSON.stringify(server), {
      headers: { "Content-Type": "application/json" },
    });
  };
  ui.render(createElement(MemoBoard, { initial, mode: "owner" }));
  return requests;
}
function order(status = "Pending") {
  return Array.from(
    ui.screen
      .getByRole("region", { name: status })
      .querySelectorAll("[data-task-id]"),
  ).map((node) => node.getAttribute("data-task-id"));
}
async function move(y: number, pointerType = "mouse") {
  await ui.act(async () => {
    ui.fireEvent.pointerMove(document, {
      clientX: 550,
      clientY: y,
      pointerType,
      isPrimary: true,
      pointerId: 1,
    });
    await frame();
  });
}
async function start(pointerType = "mouse") {
  const handle = ui.screen.getByRole("button", { name: "Reorder Alpha" });
  await ui.act(async () => {
    ui.fireEvent.pointerDown(handle, {
      clientX: 550,
      clientY: 250,
      button: 0,
      pointerType,
      isPrimary: true,
      pointerId: 1,
    });
  });
  await move(260, pointerType);
}

test("pointer drag shows a preview and insertion line, pauses refresh and saves once on release", async () => {
  const requests = setup();
  await start();
  await move(445);
  assert.ok(document.querySelector(".drag-preview"));
  assert.ok(document.querySelector(".drop-at-end"));
  assert.deepEqual(
    order(),
    tasks.map((task) => task.id),
  );
  await ui.act(async () => {
    window.dispatchEvent(new window.Event("focus"));
    await frame();
  });
  assert.equal(requests.length, 0);
  await ui.act(async () => {
    ui.fireEvent.pointerUp(document, { pointerId: 1 });
    await frame();
  });
  assert.deepEqual(order(), [tasks[1].id, tasks[2].id, tasks[0].id]);
  assert.deepEqual(requests, ["/api/tasks"]);
});

test("touch dragging moves into an empty section and Escape cancels a later drag", async () => {
  const requests = setup();
  await start("touch");
  await move(535, "touch");
  await ui.act(async () => {
    ui.fireEvent.pointerUp(document, { pointerId: 1, pointerType: "touch" });
    await frame();
  });
  assert.deepEqual(order("Waiting"), [tasks[0].id]);
  assert.equal(requests.length, 1);
  const handle = ui.screen.getByRole("button", { name: "Reorder Bravo" });
  await ui.act(async () => {
    ui.fireEvent.pointerDown(handle, {
      clientX: 550,
      clientY: 250,
      button: 0,
      isPrimary: true,
      pointerId: 1,
    });
  });
  await move(260);
  await move(330);
  await ui.act(async () => {
    ui.fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await frame();
  });
  assert.deepEqual(order(), [tasks[1].id, tasks[2].id]);
  assert.equal(requests.length, 1);
});

test("keyboard Space and arrow keys reorder items and retain a focused drag handle", async () => {
  const requests = setup();
  const handle = ui.screen.getByRole("button", { name: "Reorder Alpha" });
  handle.focus();
  await ui.act(async () => {
    ui.fireEvent.keyDown(handle, { code: "Space", key: " " });
    await frame();
  });
  await ui.act(async () => {
    ui.fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" });
    await frame();
  });
  await ui.act(async () => {
    ui.fireEvent.keyDown(document, { code: "Space", key: " " });
    await frame();
  });
  assert.deepEqual(order(), [tasks[1].id, tasks[0].id, tasks[2].id]);
  assert.equal(requests.length, 1);
  assert.equal(
    document.activeElement?.getAttribute("aria-label"),
    "Reorder Alpha",
  );
});
