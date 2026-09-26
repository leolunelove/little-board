import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { JSDOM } from "jsdom";
import {
  APPEARANCE_KEY,
  APPEARANCE_SCRIPT,
  APPEARANCE_COLORS,
} from "../lib/appearance";

let ui: typeof import("@testing-library/react");
let AppearanceControl: typeof import("../components/appearance-control").AppearanceControl;
let dom: JSDOM;
let dark = false;
const listeners = new Set<() => void>();

before(async () => {
  dom = new JSDOM(
    '<!doctype html><html><head><meta name="theme-color" content="#f7f7f5"></head><body></body></html>',
    { url: "https://memo.test", runScripts: "outside-only" },
  );
  const media = {
    get matches() {
      return dark;
    },
    addEventListener(_type: string, listener: () => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: string, listener: () => void) {
      listeners.delete(listener);
    },
  };
  Object.defineProperty(dom.window, "matchMedia", { value: () => media });
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "localStorage",
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key],
    });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  ui = await import("@testing-library/react");
  ({ AppearanceControl } = await import("../components/appearance-control"));
});
afterEach(() => {
  ui.cleanup();
  localStorage.clear();
  dark = false;
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  listeners.clear();
});

function expectMode(mode: "light" | "night") {
  assert.equal(document.documentElement.dataset.theme, mode);
  assert.equal(
    document.documentElement.style.colorScheme,
    mode === "night" ? "dark" : "light",
  );
  assert.equal(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    APPEARANCE_COLORS[mode],
  );
  assert.equal(
    ui.screen
      .getByRole("button", {
        name: mode === "night" ? "Night mode" : "Light mode",
      })
      .getAttribute("aria-pressed"),
    "true",
  );
}

test("appearance starts with the device setting and follows it until the user chooses", () => {
  ui.render(createElement(AppearanceControl));
  expectMode("light");
  ui.act(() => {
    dark = true;
    listeners.forEach((listener) => listener());
  });
  expectMode("night");
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Light mode" }));
  expectMode("light");
  ui.act(() => {
    listeners.forEach((listener) => listener());
  });
  expectMode("light");
});

test("manual night preference survives reopening and overrides a light device setting", () => {
  const first = ui.render(createElement(AppearanceControl));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Night mode" }));
  assert.equal(localStorage.getItem(APPEARANCE_KEY), "night");
  first.unmount();
  ui.render(createElement(AppearanceControl));
  expectMode("night");
});

test("changing appearance in another tab updates this one", () => {
  ui.render(createElement(AppearanceControl));
  localStorage.setItem(APPEARANCE_KEY, "night");
  ui.act(() => {
    window.dispatchEvent(
      new window.StorageEvent("storage", {
        key: APPEARANCE_KEY,
        newValue: "night",
      }),
    );
  });
  expectMode("night");
  localStorage.clear();
  ui.act(() => {
    window.dispatchEvent(new window.StorageEvent("storage", { key: null }));
  });
  expectMode("light");
});

test("blocked storage keeps the manual choice for this visit without breaking the controls", (t) => {
  const storage = Object.getPrototypeOf(localStorage);
  t.mock.method(storage, "getItem", () => {
    throw Error("Blocked");
  });
  t.mock.method(storage, "setItem", () => {
    throw Error("Blocked");
  });
  ui.render(createElement(AppearanceControl));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Night mode" }));
  expectMode("night");
  ui.act(() => {
    listeners.forEach((listener) => listener());
  });
  expectMode("night");
});

test("the head bootstrap applies the saved mode before React starts, with safe defaults", () => {
  localStorage.setItem(APPEARANCE_KEY, "night");
  dom.window.eval(APPEARANCE_SCRIPT);
  assert.equal(document.documentElement.dataset.theme, "night");
  assert.equal(
    document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    APPEARANCE_COLORS.night,
  );
  localStorage.setItem(APPEARANCE_KEY, "invalid");
  dark = true;
  dom.window.eval(APPEARANCE_SCRIPT);
  assert.equal(document.documentElement.dataset.theme, "night");
  localStorage.setItem(APPEARANCE_KEY, "light");
  dom.window.eval(APPEARANCE_SCRIPT);
  assert.equal(document.documentElement.dataset.theme, "light");
});

test("both palettes cover every surface and keep small text at readable contrast", () => {
  const css = readFileSync("app/globals.css", "utf8");
  function palette(rule: RegExp) {
    const body = css.match(rule)?.[1];
    assert.ok(body);
    return Object.fromEntries(
      [...body.matchAll(/--([a-z-]+):\s*(#[a-f0-9]+);/g)].map((match) => [
        match[1],
        match[2],
      ]),
    );
  }
  const modes = {
    light: palette(/:root\s*\{([^}]+)\}/),
    night: palette(/:root\[data-theme="night"\]\s*\{([^}]+)\}/),
  };
  const rgb = (hex: string) =>
    [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = (hex: string) =>
    rgb(hex)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
  const pairs = [
    ["ink", "paper"],
    ["muted", "paper"],
    ["muted", "hover"],
    ["muted", "editing"],
    ["muted", "surface"],
    ["muted", "tag"],
    ["accent", "paper"],
    ["done", "paper"],
    ["waiting", "paper"],
    ["red", "error-fill"],
    ["warning", "paper"],
    ["button-ink", "button"],
    ["button-ink", "button-hover"],
  ];
  for (const [name, values] of Object.entries(modes)) {
    assert.equal(
      values.paper,
      APPEARANCE_COLORS[name as keyof typeof APPEARANCE_COLORS],
    );
    for (const use of css.matchAll(/var\(--([a-z-]+)\)/g))
      assert.ok(values[use[1]], `${name} is missing ${use[1]}`);
    for (const [fg, bg] of pairs) {
      const [low, high] = [luminance(values[fg]), luminance(values[bg])].sort(
        (a, b) => a - b,
      );
      const ratio = (high + 0.05) / (low + 0.05);
      assert.ok(ratio >= 4.5, `${name} ${fg} on ${bg}: ${ratio.toFixed(2)}`);
    }
  }
});
