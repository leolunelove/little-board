import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve("out"), base = process.env.NEXT_PUBLIC_BASE_PATH || "";
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".svg":"image/svg+xml", ".txt":"text/plain; charset=utf-8", ".json":"application/json" };
createServer(async (request,response) => {
  try {
    const url = new URL(request.url,"http://127.0.0.1");
    if (base && !url.pathname.startsWith(base+"/") && url.pathname!==base) { response.writeHead(404).end();return; }
    const relative = decodeURIComponent(url.pathname.slice(base.length)).replace(/^\/+/, "");
    const requested = path.resolve(directory, relative || "index.html");
    if (!requested.startsWith(directory+path.sep)) { response.writeHead(404).end();return; }
    let data,filename=requested;
    try { data=await readFile(filename); } catch { filename=path.join(requested,"index.html"); try { data=await readFile(filename); } catch { filename=path.join(directory,"404.html"); data=await readFile(filename);response.statusCode=404; } }
    response.setHeader("Content-Type",types[path.extname(filename)] || "application/octet-stream");
    response.setHeader("Cache-Control","no-store");
    response.setHeader("Referrer-Policy","no-referrer");
    response.setHeader("X-Content-Type-Options","nosniff");
    response.end(data);
  } catch { response.writeHead(400).end(); }
}).listen(3211,"127.0.0.1",()=>console.log(`Little Board preview: http://127.0.0.1:3211${base}/`));
