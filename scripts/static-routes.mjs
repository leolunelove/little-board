import { writeFile, readFile, mkdir } from "node:fs/promises";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
// GitHub Pages has no rewrite rules. Carry only a validated numeric route back
// to the app; it restores the clean path with history.replaceState.
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Little Board</title></head><body><p>Opening Little Board…</p><script>const base=${JSON.stringify(base)};const code=location.pathname.slice(base.length).replace(/^\\/+|\\/+$/g,'');location.replace(base+'/'+(/^[1-9][0-9]{5}$/.test(code)?'?route='+code:''));</script></body></html>`;
await writeFile("out/404.html", html);
await writeFile("out/.nojekyll", "");

await mkdir("out/all", { recursive: true });
await writeFile("out/all/index.html", await readFile("out/index.html"));
