import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export { chromium };

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULT_OUT = join(tmpdir(), "webos-perf");

export const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

export const COMMON_USAGE = `Targets (at least one):
  --base=<url|dir>   baseline: a URL ending in /webos/, or a built dist dir (served with vite preview)
  --head=<url|dir>   head, same forms
  --port=5210        first port for served dirs (base, then head)
Common:
  --runs=N           runs per target, base and head interleaved
  --out=<dir>        result dir (default ${DEFAULT_OUT})
  --help`;

export function parse_args(usage, defaults) {
  const opts = { ...defaults };
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    opts[key] = rest.length ? rest.join("=") : "true";
  }
  if (opts.help || (!opts.base && !opts.head)) {
    console.log(`${usage}\n\n${COMMON_USAGE}`);
    process.exit(opts.help ? 0 : 1);
  }
  opts.out ??= DEFAULT_OUT;
  return opts;
}

export const list = (value) => String(value).split(",").filter(Boolean);
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export const round = (value) => Math.round(value * 10) / 10;

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

function serve(dir, port) {
  const abs = resolve(dir);
  const dist = existsSync(join(abs, "index.html")) ? abs : join(abs, "dist");
  if (!existsSync(join(dist, "index.html"))) throw new Error(`${dir}: no index.html (run bun run build)`);
  const child = spawn(join(ROOT, "node_modules/.bin/vite"), ["preview", "--outDir", dist, "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "inherit"],
  });
  return { child, url: `http://localhost:${port}/webos/` };
}

export async function start_targets(opts) {
  const servers = [];
  const targets = [];
  let port = Number(opts.port ?? 5210);
  for (const name of ["base", "head"]) {
    const value = opts[name];
    if (!value) continue;
    if (/^https?:/.test(value)) {
      targets.push({ name, url: value.endsWith("/") ? value : `${value}/` });
      continue;
    }
    const server = serve(value, port++);
    servers.push(server.child);
    targets.push({ name, url: server.url });
  }
  const stop = () => servers.forEach((child) => child.kill());
  process.on("exit", stop);
  for (const target of targets) {
    const deadline = Date.now() + 30000;
    while (!(await reachable(target.url))) {
      if (Date.now() > deadline) throw new Error(`${target.url} did not come up`);
      await sleep(200);
    }
  }
  return { targets, stop };
}

// Base and head swap first place each run so machine drift hits both evenly.
export const in_order = (targets, run) => (run % 2 ? [...targets].reverse() : targets).map((target) => ({ ...target, run }));

export function* interleave(targets, runs) {
  for (let run = 0; run < runs; run++) yield* in_order(targets, run);
}

export async function cdp_setup(page, { cpu = 1, network = null, cache_disabled = false } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Network.enable");
  await throttle(cdp, cpu);
  if (network) await cdp.send("Network.emulateNetworkConditions", network);
  if (cache_disabled) await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  return cdp;
}

export const throttle = (cdp, rate) => cdp.send("Emulation.setCPUThrottlingRate", { rate });

export async function raw_metrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

export async function cdp_metrics(cdp) {
  const pick = await raw_metrics(cdp);
  return {
    script_ms: round(pick.ScriptDuration * 1000),
    task_ms: round(pick.TaskDuration * 1000),
    layout_ms: round(pick.LayoutDuration * 1000),
    style_ms: round(pick.RecalcStyleDuration * 1000),
    heap_mb: round(pick.JSHeapUsedSize / 1048576),
    nodes: pick.Nodes,
    listeners: pick.JSEventListeners,
  };
}

export const splash_gone = (page) => page.waitForFunction(() => !document.getElementById("splash"), null, { timeout: 90000 });

export async function boot_settled(page, url, { skip_timeout = 20000 } = {}) {
  await page.goto(url);
  await splash_gone(page);
  const skip = page.getByRole("button", { name: /^skip$/i });
  await skip.click({ timeout: skip_timeout }).catch(() => {});
  await page.waitForTimeout(1500);
  const dismiss = page.getByRole("button", { name: "Dismiss" });
  for (let i = 0; i < 3 && (await dismiss.count()) > 0; i++) {
    await dismiss.first().click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1500);
}

export function collect_errors(page, errors) {
  page.on("pageerror", (error) => errors.push(`pageerror ${String(error).slice(0, 300)}`));
  page.on("console", (message) => message.type() === "error" && errors.push(message.text().slice(0, 300)));
}

export function stats(values) {
  const sorted = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { median: round(median), min: round(sorted[0]), max: round(sorted.at(-1)), n: sorted.length };
}

export function summarize(runs, fields) {
  const groups = {};
  for (const run of runs) (groups[`${run.scenario}|${run.target}`] ??= []).push(run);
  const out = {};
  for (const [key, group] of Object.entries(groups)) {
    out[key] = Object.fromEntries(fields.map((field) => [field, stats(group.map((run) => field.split(".").reduce((o, k) => o?.[k], run)))]));
  }
  return out;
}

export function save(opts, name, data) {
  mkdirSync(opts.out, { recursive: true });
  const file = join(opts.out, `${name}.json`);
  writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), opts, ...data }, null, 2));
  console.error(`wrote ${file}`);
  return file;
}
