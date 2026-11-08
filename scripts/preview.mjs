import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/mark.svg", ["mark.svg", "image/svg+xml"]],
]);
const root = fileURLToPath(new URL("../dist/", import.meta.url));
export function createPreviewServer() {
  return createServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return; }
    const target = assets.get((req.url || "").split("?")[0]);
    if (!target) { res.writeHead(404); res.end("Tidak ditemukan"); return; }
    try {
      const bytes = await readFile(resolve(root, target[0]));
      res.writeHead(200, { "Content-Type": target[1] });
      res.end(req.method === "HEAD" ? undefined : bytes);
    } catch { res.writeHead(500); res.end("Aset pratinjau tidak tersedia"); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPreviewServer();
  server.on("error", error => { console.error(error.code); process.exitCode = 1; });
  server.listen(4318, "127.0.0.1", () => console.log("Ruwang Control preview: http://127.0.0.1:4318"));
}
