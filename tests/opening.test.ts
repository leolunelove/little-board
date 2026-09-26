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
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
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
  await ui.waitFor(() => assert.match(ui.screen.getByRole("alert").textContent!, /expired/));
  assert.equal(window.location.search, "");
  assert.ok(ui.screen.getByLabelText("Email address"));
});

test("leaving a guest board flushes a pending deletion synchronously", async () => {
  const post = (path: string, body: unknown, keepalive = false) => actual(path, { method: "POST", body: JSON.stringify(body), keepalive });
  const board = await (await post("/api/memos", { requestId: crypto.randomUUID() })).json();
  const id = crypto.randomUUID();
  await post(`/api/memos/${board.code}`, { action: "add", task: { id, title: "Temporary item" } });
  const pending = post(`/api/memos/${board.code}`, { action: "delete", id }, true);
  assert.equal(JSON.parse(localStorage.getItem("little-board:guests:v1")!)[0].tasks.length, 0);
  assert.equal((await pending).status, 200);
});
