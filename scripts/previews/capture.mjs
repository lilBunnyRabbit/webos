import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SCENES } from "./scenes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const USAGE = `Captures the App Store pictures (manifest \`preview\`) against a running dev server.

  bun dev --port 5180 --strictPort
  node scripts/previews/capture.mjs --base=http://localhost:5180/webos/ [--only=calendar,clock] [--out=<dir>]

Writes src/lib/apps/{system,user}/{id}/preview.webp, or <dir>/{id}.webp and .png with --out.
Scenes (seed data and steps per app) live in scripts/previews/scenes.mjs.`;

const opts = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : "true"];
    })
);
if (opts.help || !opts.base) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}

const BASE = opts.base.endsWith("/") ? opts.base : `${opts.base}/`;
const WIDTH = 1200;
const HEIGHT = 750;
const SCALE = Number(opts.scale ?? 1.25);
const QUALITY = Number(opts.quality ?? 0.75);
const only = opts.only ? new Set(opts.only.split(",")) : null;
const scenes = SCENES.filter((scene) => !only || only.has(scene.id));
if (scenes.length === 0) throw new Error(`no scene for ${opts.only}`);

const browser = await chromium.launch();
const encoder = await (await browser.newContext()).newPage();

async function boot(page) {
  await page.goto(BASE);
  await page
    .getByRole("button", { name: "Continue anyway" })
    .click({ timeout: 20000 })
    .catch(() => {});
  await page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 120000 });
  await page.waitForTimeout(1500);
}

async function first_boot(page) {
  await boot(page);
  await page
    .getByRole("button", { name: /^skip$/i })
    .click({ timeout: 20000 })
    .catch(() => {});
  await page
    .getByRole("button", { name: "No thanks" })
    .click({ timeout: 10000 })
    .catch(() => {});
  await command(page, "theme set Brand Light");
}

async function command(page, line) {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await page.keyboard.type(`>${line}`);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}

async function write_files(page, files) {
  await page.evaluate(async (files) => {
    const root = await navigator.storage.getDirectory();
    for (const file of files) {
      const parts = file.path.split("/").filter(Boolean);
      const name = parts.pop();
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(file.base64 ? Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)) : file.text);
      await writable.close();
    }
  }, files);
}

async function maximize(page) {
  const box = await page.locator("[data-window-id]").first().boundingBox();
  const viewport = page.viewportSize();
  if (box && box.width < viewport.width - 40) await command(page, "win maximize");
  await page.waitForTimeout(600);
  const fitted = await page.locator("[data-window-id]").first().boundingBox();
  await page.setViewportSize({
    width: viewport.width + (WIDTH - Math.round(fitted.width)),
    height: viewport.height + (HEIGHT - Math.round(fitted.height)),
  });
  await page.waitForTimeout(800);
}

async function to_webp(png) {
  const base64 = await encoder.evaluate(
    async ({ data, quality }) => {
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: "image/png" })
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/webp", quality })).arrayBuffer());
      let text = "";
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(text);
    },
    { data: png.toString("base64"), quality: QUALITY }
  );
  return Buffer.from(base64, "base64");
}

const report = [];
for (const scene of scenes) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT + 90 },
    deviceScaleFactor: SCALE,
    timezoneId: scene.timezone,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`${scene.id}: ${error.message}`));
  try {
    await first_boot(page);
    const tools = {
      base: BASE,
      command: (line) => command(page, line),
      write_files: (files) => write_files(page, files),
    };
    await scene.seed?.(page, tools);
    const query = scene.props ? `?${new URLSearchParams(scene.props)}` : "";
    await page.evaluate((hash) => (location.hash = hash), `#/app/${scene.id}${query}`);
    await page.locator("[data-window-id]").first().waitFor({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Got it" })
      .click({ timeout: 3000 })
      .catch(() => {});
    await maximize(page);
    const win = page.locator("[data-window-id]").first();
    await scene.act?.(page, win, tools);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(scene.settle ?? 1200);
    const png = await win.screenshot({ animations: "disabled" });
    const webp = await to_webp(png);
    const target = opts.out
      ? join(opts.out, `${scene.id}.webp`)
      : join(ROOT, "src/lib/apps", scene.kind ?? "user", scene.id, "preview.webp");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, webp);
    if (opts.out) writeFileSync(join(opts.out, `${scene.id}.png`), png);
    report.push(`${scene.id.padEnd(20)} ${(webp.length / 1024).toFixed(1).padStart(6)} KB  ${target}`);
    console.log(report.at(-1));
  } catch (error) {
    console.error(`${scene.id} failed: ${error.message}`);
    if (opts.out) await page.screenshot({ path: join(opts.out, `${scene.id}-failed.png`) }).catch(() => {});
    process.exitCode = 1;
  }
  await context.close();
}
await browser.close();
