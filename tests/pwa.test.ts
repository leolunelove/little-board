import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

test("install shell works offline at board routes and never caches private API data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "little-board-pwa-"));
  try {
    await mkdir(join(dir, "out/_next/static"), { recursive: true });
    await writeFile(join(dir, "out/index.html"), "public app shell");
    await writeFile(join(dir, "out/_next/static/app.js"), "app");
    execFileSync(process.execPath, [resolve("scripts/build-pwa.mjs")], {
      cwd: dir,
      env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "/little-board" },
    });
    const manifest = JSON.parse(
      await readFile(join(dir, "out/manifest.webmanifest"), "utf8"),
    );
    assert.equal(manifest.start_url, "/little-board/?launch=1");
    assert.equal(manifest.scope, "/little-board/");
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.icons[1].sizes, "512x512");
    const listeners: Record<string, (event: any) => void> = {};
    let paths: string[] = [];
    const removed: string[] = [];
    const cache = {
      addAll: async (assets: string[]) => {
        paths = assets;
      },
      match: async (request: any) =>
        request === "/little-board/index.html"
          ? "cached shell"
          : "cached asset",
    };
    vm.runInNewContext(await readFile(join(dir, "out/sw.js"), "utf8"), {
      URL,
      self: {
        location: { origin: "https://example.com" },
        addEventListener: (name: string, fn: any) => {
          listeners[name] = fn;
        },
        clients: { claim: async () => {} },
        skipWaiting() {},
      },
      caches: {
        open: async () => cache,
        keys: async () => ["little-board-shell-old", "unrelated"],
        delete: async (key: string) => {
          removed.push(key);
        },
      },
      fetch: () => {
        throw new Error("offline");
      },
    });
    let wait!: Promise<unknown>;
    listeners.install({
      waitUntil: (p: Promise<unknown>) => {
        wait = p;
      },
    });
    await wait;
    assert(paths.every((path) => !/api|supabase|auth|[0-9]{6}/.test(path)));
    assert(paths.includes("/little-board/_next/static/app.js"));
    listeners.activate({
      waitUntil: (p: Promise<unknown>) => {
        wait = p;
      },
    });
    await wait;
    assert.deepEqual(removed, ["little-board-shell-old"]);
    const intercepted = (url: string, mode = "cors", method = "GET") => {
      let response: Promise<unknown> | undefined;
      listeners.fetch({
        request: { url, mode, method },
        respondWith: (p: Promise<unknown>) => {
          response = p;
        },
      });
      return response;
    };
    for (const route of ["", "all/", "926163"])
      assert.equal(
        await intercepted(
          `https://example.com/little-board/${route}`,
          "navigate",
        ),
        "cached shell",
      );
    assert.equal(
      intercepted("https://example.com/api/memos/926163"),
      undefined,
    );
    assert.equal(
      intercepted("https://project.supabase.co/rest/v1/little_boards"),
      undefined,
    );
    assert.equal(
      intercepted(
        "https://example.com/little-board/?code=secret",
        "cors",
        "POST",
      ),
      undefined,
    );
    assert.equal(
      await intercepted(
        "https://example.com/little-board/_next/static/app.js?v=1",
      ),
      "cached asset",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
