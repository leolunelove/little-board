import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const root = "out";
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + entry.name;
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}
const files = (await walk(root + "/_next")).filter((p) =>
  /\.(js|css|woff2?)$/.test(p),
);
const assets = [
  base + "/",
  base + "/index.html",
  base + "/manifest.webmanifest",
  base + "/icon.svg",
  base + "/icon-192.png",
  base + "/icon-512.png",
  ...files.map((p) => base + "/" + p.slice(root.length + 1)),
];
const manifest = {
  id: base + "/",
  name: "Little Board",
  short_name: "Little Board",
  description: "A little less to remember.",
  start_url: base + "/?launch=1",
  scope: base + "/",
  display: "standalone",
  background_color: "#f8fafc",
  theme_color: "#f8fafc",
  icons: [
    {
      src: base + "/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: base + "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any maskable",
    },
  ],
  shortcuts: [
    { name: "Your boards", url: base + "/" },
    { name: "All items", url: base + "/all/" },
  ],
};
await writeFile(root + "/manifest.webmanifest", JSON.stringify(manifest));
const hash = createHash("sha256");
for (const file of [
  ...files,
  root + "/index.html",
  root + "/manifest.webmanifest",
])
  hash.update(await readFile(file));
const cache = "little-board-shell-" + hash.digest("hex").slice(0, 16);
const source = `const CACHE=${JSON.stringify(cache)},BASE=${JSON.stringify(base)},ASSETS=${JSON.stringify(assets)};const URLS=new Set(ASSETS);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('little-board-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin)return;const route=url.pathname.slice(BASE.length).replace(/^\\/+|\\/+$/g,'');const app=request.mode==='navigate'&&(route===''||route==='all'||/^[1-9][0-9]{5}$/.test(route));if(app){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(BASE+'/index.html')||await fetch(request);})());return;}if(URLS.has(url.pathname)){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(request,{ignoreSearch:true})||await fetch(request);})());}});
`;
await writeFile(root + "/sw.js", source);
console.log("PWA shell prepared: " + assets.length + " public assets.");
