import { before, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import { transport } from "../lib/transport";
let ui: typeof import("@testing-library/react"),
  App: typeof import("../components/little-board-app").LittleBoardApp,
  Email: typeof import("../components/magic-link-form").MagicLinkForm;
const actual = transport.request;
before(async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://little.test/",
    pretendToBeVisual: true,
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
    "sessionStorage",
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  dom.window.scrollTo = () => {};
  Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    PopStateEvent: dom.window.PopStateEvent,
  });
  ui = await import("@testing-library/react");
  ({ LittleBoardApp: App } = await import("../components/little-board-app"));
  ({ MagicLinkForm: Email } = await import("../components/magic-link-form"));
});
afterEach(() => {
  ui.cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  transport.request = actual;
});
test("opening offers create or email; creating instantly opens an empty persistent board", async () => {
  ui.render(createElement(App));
  assert.ok(ui.screen.getByRole("button", { name: "Create board" }));
  assert.ok(ui.screen.getByRole("button", { name: "Sign in with email" }));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Create board" }));
  await ui.waitFor(() =>
    assert.ok(ui.screen.getByText("Saved on this device.")),
  );
  assert.match(window.location.pathname, /^\/[1-9][0-9]{5}$/);
  assert.ok(ui.screen.getByRole("button", { name: "Save with email" }));
  const saved = localStorage.getItem("little-board:guests:v1")!;
  assert.equal(JSON.parse(saved).length, 1);
  assert.deepEqual(JSON.parse(saved)[0].tasks, []);
  ui.cleanup();
  ui.render(createElement(App));
  await ui.waitFor(() =>
    assert.ok(ui.screen.getByText("Saved on this device.")),
  );
});
test("signed-in home puts saved boards and their live status counts first", async () => {
  transport.request = async () =>
    Response.json({
      boards: [
        {
          id: "board-1",
          code: "820278",
          title: "My board",
          updated_at: new Date().toISOString(),
          claimed: true,
          access: "owner",
          tasks: [
            { status: "pending", completed_at: null },
            { status: "waiting", completed_at: null },
            { status: "done", completed_at: new Date().toISOString() },
            { status: "done", completed_at: "2020-01-01T00:00:00.000Z" },
          ],
        },
      ],
      email: "owner@example.com",
      emailReady: true,
    });
  ui.render(createElement(App));
  await ui.waitFor(() =>
    assert.ok(ui.screen.getByRole("heading", { name: "Your boards" })),
  );
  assert.ok(ui.screen.getByRole("button", { name: /My board/ }));
  assert.ok(ui.screen.getByText("1 pending"));
  assert.ok(ui.screen.getByText("1 waiting"));
  assert.ok(ui.screen.getByText("1 done"));
  assert.equal(ui.screen.queryByText("A little less"), null);
  assert.ok(ui.screen.getByRole("button", { name: "New board" }));
});
test("email entry sends a magic link, never asks for a password or code, and reports sending failures", async () => {
  const requests: Record<string, unknown>[] = [];
  transport.request = async (_path, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ ok: true });
  };
  ui.render(createElement(Email, { ready: true }));
  ui.fireEvent.change(ui.screen.getByLabelText("Email address"), {
    target: { value: "owner@example.com" },
  });
  ui.fireEvent.submit(ui.screen.getByRole("form", { name: "Email sign in" }));
  await ui.waitFor(() => assert.ok(ui.screen.getByText("Check your inbox.")));
  assert.deepEqual(requests, [
    { action: "request", email: "owner@example.com" },
  ]);
  assert.equal(document.querySelector('input[type="password"]'), null);
  assert.equal(ui.screen.queryByLabelText("Email code"), null);
  assert.ok(
    (
      ui.screen.getByRole("button", {
        name: /Send again in/,
      }) as HTMLButtonElement
    ).disabled,
  );
  ui.cleanup();
  transport.request = async () =>
    Response.json({ error: "Unable to send" }, { status: 503 });
  ui.render(createElement(Email, { ready: true }));
  ui.fireEvent.change(ui.screen.getByLabelText("Email address"), {
    target: { value: "owner@example.com" },
  });
  ui.fireEvent.submit(ui.screen.getByRole("form", { name: "Email sign in" }));
  await ui.waitFor(() =>
    assert.equal(ui.screen.getByRole("alert").textContent, "Unable to send"),
  );
  assert.equal(ui.screen.queryByText("Check your inbox."), null);
});
test("unconfigured email is explicit and never claims to send a link", () => {
  ui.render(createElement(Email, { ready: false }));
  assert.ok(
    (
      ui.screen.getByRole("button", {
        name: "Send magic link",
      }) as HTMLButtonElement
    ).disabled,
  );
  assert.match(
    ui.screen.getByRole("status").textContent!,
    /isn’t available yet/,
  );
});

test("expired callback returns to email entry and removes the invalid URL parameters", async () => {
  window.history.replaceState(null, "", "/?error_description=expired");
  ui.render(createElement(App));
  await ui.waitFor(() =>
    assert.match(ui.screen.getByRole("alert").textContent!, /expired/),
  );
  assert.equal(window.location.search, "");
  assert.ok(ui.screen.getByLabelText("Email address"));
});

test("leaving a guest board flushes a pending deletion synchronously", async () => {
  const post = (path: string, body: unknown, keepalive = false) =>
    actual(path, { method: "POST", body: JSON.stringify(body), keepalive });
  const board = await (
    await post("/api/memos", { requestId: crypto.randomUUID() })
  ).json();
  const id = crypto.randomUUID();
  await post(`/api/memos/${board.code}`, {
    action: "add",
    task: { id, title: "Temporary item" },
  });
  const pending = post(
    `/api/memos/${board.code}`,
    { action: "delete", id },
    true,
  );
  assert.equal(
    JSON.parse(localStorage.getItem("little-board:guests:v1")!)[0].tasks.length,
    0,
  );
  assert.equal((await pending).status, 200);
});

test("sharing previews the latest saved board read-only and copies its clean viewer address", async () => {
  const stamp = new Date().toISOString();
  const board = {
    id: "11111111-1111-4111-8111-111111111111",
    code: "820278",
    title: "Menu",
    claimed: true,
    access: "owner",
    invited_email: "viewer@example.com",
    updated_at: stamp,
    tasks: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        board_id: "11111111-1111-4111-8111-111111111111",
        title: "Current saved item",
        note: "",
        status: "pending",
        assigned_to: null,
        sort_order: 1024,
        created_at: stamp,
        updated_at: stamp,
        completed_at: null,
      },
    ],
  };
  let reads = 0,
    copied = "";
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      async writeText(text: string) {
        copied = text;
      },
    },
  });
  transport.request = async (path) =>
    path === "/api/memos"
      ? Response.json({
          boards: [board],
          email: "owner@example.com",
          emailReady: true,
        })
      : (reads++,
        Response.json({
          ...board,
          tasks: board.tasks.map((task) => ({
            ...task,
            title: reads > 1 ? "Latest saved item" : task.title,
          })),
        }));
  window.history.replaceState(null, "", "/820278");
  ui.render(createElement(App));
  await ui.waitFor(() =>
    assert.ok(ui.screen.getByRole("button", { name: "Share board" })),
  );
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Share board" }));
  await ui.waitFor(() =>
    assert.ok(ui.screen.getByRole("button", { name: "Preview their view" })),
  );
  await ui.act(async () => {
    ui.fireEvent.click(
      ui.screen.getByRole("button", { name: "Preview their view" }),
    );
  });
  const preview = ui.screen.getByRole("dialog", { name: "Viewer preview" });
  assert.ok(ui.within(preview).getByText("Latest saved item"));
  assert.equal(
    ui.within(preview).queryByRole("button", { name: "Add item" }),
    null,
  );
  assert.equal(
    ui.within(preview).queryByRole("button", { name: /Complete Latest/ }),
    null,
  );
  ui.fireEvent.click(
    ui.screen.getByRole("button", { name: "← Back to sharing" }),
  );
  await ui.act(async () => {
    ui.fireEvent.click(
      ui.screen.getByRole("button", { name: "Copy viewer link" }),
    );
  });
  assert.equal(copied, "https://little.test/820278");
});
