// Renders the Instagram Reel (D138): Chrome draws reel.html at 1080 x 1920 for every frame (30 a
// second), ffmpeg joins the frames into an H.264 MP4 with a silent AAC track (add music in
// Instagram's own editor), and a cover is cut at 6.6 s. Also keeps six sample frames for a check.
// Usage, from the repo root: node marketing/reel/render.mjs en hi   (needs Chrome and ffmpeg)
import { spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..", "..");
const out = join(here, "out");
const FPS = 30;
const SAMPLES = [1.6, 5.9, 9.4, 16.2, 19.0, 22.5];
const types = { ".html": "text/html", ".png": "image/png", ".ttf": "font/ttf" };
// Only the reel's folder and the app's fonts are served.
const allowed = [join(root, "marketing", "reel") + sep, join(root, "apps", "mobile", "assets", "fonts") + sep];

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const file = resolve(root, "." + normalize(path));
  if (!allowed.some((dir) => file.startsWith(dir)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status})`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
mkdirSync(join(out, "samples"), { recursive: true });
for (const lang of process.argv.slice(2)) {
  const frames = join(out, `frames-${lang}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push(`failed: ${r.url()}`));
  await page.goto(`http://127.0.0.1:${port}/marketing/reel/reel.html?lang=${lang}`, { waitUntil: "networkidle" });
  // Every face loaded, and the app's capture decoded, before the first frame.
  await page.evaluate(async () => {
    await Promise.all(["Anek-Text", "Anek-Sign", "Anek-Display"].map((f) => document.fonts.load(`40px "${f}"`)));
    await document.fonts.ready;
    await document.querySelector("#phone img").decode();
  });
  const missing = await page.evaluate(() => ["Anek-Text", "Anek-Sign", "Anek-Display"].filter((f) => !document.fonts.check(`40px "${f}"`)));
  if (missing.length || errors.length) throw new Error(`${lang}: fonts ${missing} errors ${errors}`);
  const duration = await page.evaluate(() => window.REEL_DURATION);
  const total = Math.round(duration * FPS);
  const stage = page.locator("#stage");
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    await stage.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.png`) });
  }
  for (const s of SAMPLES) copyFileSync(join(frames, `${String(Math.round(s * FPS)).padStart(5, "0")}.png`), join(out, "samples", `${lang}-${s}s.png`));
  await page.close();
  const mp4 = join(out, `kinaara-reel-${lang === "hi" ? "hinglish" : "english"}.mp4`);
  run("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%05d.png"),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map", "0:v", "-map", "1:a", "-shortest",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4,
  ]);
  run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "6.6", "-i", mp4, "-frames:v", "1", "-q:v", "2", mp4.replace(/\.mp4$/, "-cover.jpg")]);
  run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate,pix_fmt:format=duration,size", "-of", "compact", mp4]);
  console.log(`${lang}: ${total} frames -> ${mp4}`);
}
await browser.close();
server.close();
