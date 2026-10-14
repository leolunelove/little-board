import { test } from "node:test";
import assert from "node:assert/strict";
import { menuPlacement } from "../lib/menu-position";
test("menus choose the available side and remain inside short or offset viewports", () => {
  assert.deepEqual(menuPlacement(200, 244, 253, 0, 844), {
    up: false,
    maxHeight: 592,
  });
  assert.deepEqual(menuPlacement(400, 444, 253, 0, 480), {
    up: true,
    maxHeight: 392,
  });
  const offset = menuPlacement(300, 344, 253, 100, 320);
  assert.equal(offset.up, true);
  assert.equal(300 - 4 - offset.maxHeight, 104);
  const small = menuPlacement(90, 134, 253, 0, 240);
  assert.equal(small.up, false);
  assert.equal(134 + 4 + small.maxHeight, 236);
});
