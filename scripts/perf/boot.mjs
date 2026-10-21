import { cdp_metrics, cdp_setup, chromium, collect_errors, interleave, list, parse_args, round, save, SLOW_4G, splash_gone, start_targets, summarize, VIEWPORTS } from "./lib.mjs";
import { boot_probe } from "./probe.mjs";

const USAGE = `Boot of each target: splash steps, splash end, settle, long tasks, TBT, requests, JS heap.
  node scripts/perf/boot.mjs --base=<url|dir> --head=<url|dir> [--runs=7] [--cpu=1,4]
    [--scenarios=first,repeat,repeat-sw,mobile-first,slow4g-first]   also: mobile-repeat-sw
    [--quiet=1000]  ms without a long task that counts as settled   [--cap=30000]
Writes boot.json; report: node scripts/perf/report.mjs <out>/boot.json [--steps]`;

const opts = parse_args(USAGE, { runs: "7", cpu: "1,4", scenarios: "first,repeat,repeat-sw,mobile-first,slow4g-first", quiet: "1000", cap: "30000" });

const SCENARIOS = {
  first: { viewport: "desktop", sw: false, prime: false },
  repeat: { viewport: "desktop", sw: false, prime: true, cache_disabled: true },
  "repeat-sw": { viewport: "desktop", sw: true, prime: true },
  "mobile-first": { viewport: "mobile", sw: false, prime: false, query: "?platform=mobile" },
  "mobile-repeat-sw": { viewport: "mobile", sw: true, prime: true, query: "?platform=mobile" },
  "slow4g-first": { viewport: "desktop", sw: false, prime: false, network: SLOW_4G },
};

function wait_quiet(page) {
  return page.evaluate(
    ({ quiet, cap }) =>
      new Promise((resolve) => {
        const probe = window.__perf;
        const tick = () => {
          const now = performance.now();
          if (probe.painted !== null) {
            const last_long = probe.long.reduce((m, e) => Math.max(m, e.start + e.duration), probe.painted);
            if (now - last_long >= quiet) return resolve(last_long);
          }
          if (now > cap) return resolve(null);
          setTimeout(tick, 100);
        };
        tick();
      }),
    { quiet: Number(opts.quiet), cap: Number(opts.cap) }
  );
}

async function prime(context, url, sw) {
  const page = await context.newPage();
  await page.goto(url);
  await splash_gone(page);
  if (sw) await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60000 });
  // First-boot writes (intro seen marker, layout, settings) must land before the measured reload.
  await page.waitForTimeout(1500);
  await page.close();
}

async function run_once(browser, target, name, cpu) {
  const scenario = SCENARIOS[name];
  const url = target.url + (scenario.query ?? "");
  const context = await browser.newContext({ ...VIEWPORTS[scenario.viewport], serviceWorkers: scenario.sw ? "allow" : "block" });
  await context.addInitScript(boot_probe);
  if (scenario.prime) await prime(context, url, scenario.sw);

  const page = await context.newPage();
  const requests = [];
  page.on("requestfinished", async (request) => {
    const sizes = await request.sizes().catch(() => null);
    const response = await request.response().catch(() => null);
    requests.push({ url: request.url().replace(target.url, "/"), type: request.resourceType(), sw: response?.fromServiceWorker() ?? false, bytes: sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0 });
  });
  const errors = [];
  collect_errors(page, errors);

  const cdp = await cdp_setup(page, { cpu, network: scenario.network ?? null, cache_disabled: scenario.cache_disabled });
  const started = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForFunction(() => window.__perf?.painted !== null, null, { timeout: 120000, polling: 50 });
  const settled = await wait_quiet(page);
  const probe = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, e.startTime]));
    return { ...window.__perf, dcl: nav.domContentLoadedEventEnd, fcp: paint["first-contentful-paint"] ?? null };
  });
  const metrics = await cdp_metrics(cdp);
  await context.close();

  const steps = probe.steps.map((step, i) => ({ label: step.label, ms: round((probe.steps[i + 1]?.at ?? probe.splash_end) - step.at) }));
  const boot_long = probe.long.filter((e) => e.start <= (settled ?? Infinity));
  return {
    scenario: `${name}@${cpu}x`,
    target: target.name,
    run: target.run,
    fcp: round(probe.fcp),
    dcl: round(probe.dcl),
    first_step: round(probe.steps[0]?.at ?? NaN),
    splash_end: round(probe.splash_end),
    painted: round(probe.painted),
    settled: settled === null ? null : round(settled),
    kernel_init: round(probe.splash_end - (probe.steps[0]?.at ?? NaN)),
    long_count: boot_long.length,
    long_total: round(boot_long.reduce((s, e) => s + e.duration, 0)),
    long_max: round(boot_long.reduce((m, e) => Math.max(m, e.duration), 0)),
    tbt: round(boot_long.reduce((s, e) => s + Math.max(0, e.duration - 50), 0)),
    requests: requests.length,
    request_kb: round(requests.reduce((s, r) => s + r.bytes, 0) / 1000),
    request_list: requests.map((r) => `${r.type} ${r.sw ? "sw " : ""}${r.url.replace(/-[A-Za-z0-9_-]{8}\./, "-*.")}`).sort(),
    steps,
    metrics,
    errors,
    wall_ms: Date.now() - started,
  };
}

const { targets, stop } = await start_targets(opts);
const browser = await chromium.launch();
const runs = [];
const cpus = list(opts.cpu).map(Number);
for (const cpu of cpus) {
  for (const name of list(opts.scenarios)) {
    // Slow 4G is network-bound; measured once, at the highest throttle.
    if (name.startsWith("slow4g") && cpu !== Math.max(...cpus)) continue;
    for (const item of interleave(targets, Number(opts.runs))) {
      const result = await run_once(browser, item, name, cpu);
      runs.push(result);
      console.error(`${result.scenario} ${item.name}#${item.run}: splash ${result.splash_end} settled ${result.settled} long ${result.long_count}/${result.long_max}ms tbt ${result.tbt} req ${result.requests}${result.errors.length ? ` errors ${result.errors.length}` : ""}`);
    }
  }
}
await browser.close();
stop();

const fields = ["fcp", "first_step", "splash_end", "painted", "settled", "kernel_init", "long_count", "long_total", "long_max", "tbt", "requests", "request_kb", "metrics.script_ms", "metrics.task_ms", "metrics.heap_mb", "metrics.listeners", "metrics.nodes"];
const step_runs = runs.flatMap((r) => r.steps.map((s, i) => ({ scenario: `${r.scenario} #${String(i).padStart(2, "0")} ${s.label}`, target: r.target, ms: s.ms })));
save(opts, "boot", { summary: summarize(runs, fields), steps: summarize(step_runs, ["ms"]), runs });
