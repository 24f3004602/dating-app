// Serves the exported Expo web build (single-page output) for the e2e run.
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 8772);
const api = new URL(process.argv[4] ?? "http://127.0.0.1:8771");
// The beta server's policy for the app (infra/beta/app-csp.txt, D096), so the
// whole e2e suite checks that the app works under it.
const csp = readFileSync(new URL("../infra/beta/app-csp.txt", import.meta.url), "utf8")
  .trim()
  .replaceAll("{API_ORIGIN}", api.origin)
  .replaceAll("{API_WS_ORIGIN}", `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".ttf": "font/ttf",
};

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const relative = normalize(pathname).split(/[\\/]+/).filter(Boolean).join(sep);
  let file = join(root, relative);
  // Anything outside the build, missing, or a directory gets the app shell.
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
  res.writeHead(200, {
    "content-type": types[extname(file)] ?? "application/octet-stream",
    "content-security-policy": csp,
  });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
