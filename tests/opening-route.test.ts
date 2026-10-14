import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { openingRouteScript } from "../lib/opening-route";
test("direct board and All items routes get a quiet first frame without hiding the homepage or login", () => {
  for (const [base, path, loading] of [
    ["", "/926163", true],
    ["", "/all/", true],
    ["/little-board", "/little-board/123456", true],
    ["", "/", false],
    ["", "/login", false],
    ["", "/123", false],
    ["", "/000000", false],
  ] as const) {
    const dataset: Record<string, string> = {};
    vm.runInNewContext(openingRouteScript(base), {
      location: { pathname: path },
      document: { documentElement: { dataset } },
    });
    assert.equal(dataset.routeLoading === "true", loading);
  }
});
