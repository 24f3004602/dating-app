// WEB-PWA-1 (stage 28b, D153): the web app can be added to a phone's home screen. Chrome needs a
// manifest with a name, 192 and 512 px icons, a start URL and a standalone display; the icons
// must be the sizes they claim; the colours are the app's own; no service worker caches the app.
import { color } from "@/theme/tokens";

// The app's TypeScript has no Node types; Jest runs on Node (as primitives.test.tsx does).
declare const __dirname: string;
type FileBytes = { readUInt32BE: (offset: number) => number; toString: (encoding: string, start: number, end: number) => string };
const { readFileSync } = require("fs") as {
  readFileSync: ((path: string, encoding: "utf8") => string) & ((path: string) => FileBytes);
};

const publicDir = `${__dirname}/../../public`;
const manifest = JSON.parse(readFileSync(`${publicDir}/manifest.json`, "utf8"));
const html = readFileSync(`${publicDir}/index.html`, "utf8");

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(file: string): [number, number] {
  const bytes = readFileSync(`${publicDir}${file}`);
  expect(bytes.toString("latin1", 1, 4)).toBe("PNG");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

test("WEB-PWA-1: a manifest Chrome installs, icons of the sizes they claim, the app's colours", () => {
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name.length).toBeLessThanOrEqual(12); // fits under a home-screen icon
  expect(manifest).toMatchObject({ start_url: "/", scope: "/", display: "standalone", orientation: "portrait" });
  expect(manifest.prefer_related_applications).toBeUndefined();
  expect(manifest.theme_color).toBe(color.sign); // the graphite app bar
  expect(manifest.background_color).toBe(color.bg);

  const icons = manifest.icons as { src: string; sizes: string; type: string; purpose: string }[];
  for (const icon of icons) {
    const [width, height] = pngSize(icon.src);
    expect(`${width}x${height}`).toBe(icon.sizes);
    expect(icon.type).toBe("image/png");
  }
  const any = icons.filter((i) => i.purpose === "any").map((i) => i.sizes);
  expect(any).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  expect(pngSize("/icons/apple-touch-icon.png")).toEqual([180, 180]);

  // The page links them; the browser's bar takes the same graphite; nothing registers a worker.
  expect(html).toContain('<link rel="manifest" href="/manifest.json" />');
  expect(html).toContain(`<meta name="theme-color" content="${color.sign}" />`);
  expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
  expect(html).not.toMatch(/serviceWorker/);
});
