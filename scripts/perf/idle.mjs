import { boot_settled, chromium, collect_errors, in_order, list, parse_args, raw_metrics, round, save, sleep, start_targets, summarize, VIEWPORTS } from "./lib.mjs";
import { idle_instrument } from "./probe.mjs";

const USAGE = `Work done while nobody touches the desktop: wake-ups, locks, OPFS, channel posts, fetches, script ms, heap.
  node scripts/perf/idle.mjs --base=<url|dir> --head=<url|dir> [--runs=5] [--minutes=3] [--warmup=30]
    [--scenarios=visible,hidden,twotab,focus]
      visible  one tab idle for --minutes, then 3 open/close cycles of 10 apps for heap growth
      hidden   same tab simulated hidden (headless keeps tabs visible; Chrome's own hidden throttling is not applied)
      twotab   tab A hidden behind tab B, both idle for --minutes, then 10 tab switches 10 s apart
      focus    20 window blur/focus events, 10 hide/show cycles, then 50 s control
    [--serial]  one job at a time; default runs every scenario and target of a round in parallel
Rates are per minute. ~--minutes + 2 min per round in parallel. Writes idle.json; report: node scripts/perf/report.mjs <out>/idle.json`;

const opts = parse_args(USAGE, { runs: "5", minutes: "3", warmup: "30", scenarios: "visible,hidden,twotab,focus" });
const MINUTE = 60000;
const LEAK_APPS = ["calculator", "text-editor", "file-explorer", "terminal", "settings", "kernel", "activity-monitor", "calculator", "text-editor", "file-explorer"];

async function boot(page, url, skip_timeout) {
  await boot_settled(page, url, { skip_timeout });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  return { page, cdp };
}

async function sample({ page, cdp }, gc = false) {
  if (gc) {
    await cdp.send("HeapProfiler.collectGarbage");
    await cdp.send("HeapProfiler.collectGarbage");
  }
  const m = await raw_metrics(cdp);
  const heap = await cdp.send("Runtime.getHeapUsage");
  return { t: Date.now(), script_s: m.ScriptDuration, task_s: m.TaskDuration, layouts: m.LayoutCount, heap_used: heap.usedSize, snap: await page.evaluate(() => window.__idle.snapshot()) };
}

const total = (snap, key, field = "n") => Object.values(snap[key]).reduce((sum, entry) => sum + (entry[field] ?? 0), 0);
const wake = (snap) => total(snap, "timers", "fires") + snap.raf.fires + snap.ric.fires;
const opfs_op = (snap, op) => snap.opfs[op]?.n ?? 0;

function rates(a, b) {
  const minutes = (b.t - a.t) / MINUTE;
  const [A, B] = [a.snap, b.snap];
  const per = (value) => round(value / minutes);
  return {
    wake: per(wake(B) - wake(A)),
    timer_fires: per(total(B, "timers", "fires") - total(A, "timers", "fires")),
    raf: per(B.raf.fires - A.raf.fires),
    script_ms: per((b.script_s - a.script_s) * 1000),
    task_ms: per((b.task_s - a.task_s) * 1000),
    locks: per(total(B, "locks") - total(A, "locks")),
    opfs_ops: per(total(B, "opfs") - total(A, "opfs")),
    opfs_reads: per(opfs_op(B, "file.getFile") - opfs_op(A, "file.getFile")),
    opfs_writes: per(opfs_op(B, "file.createWritable") - opfs_op(A, "file.createWritable")),
    bc_post: per(total(B, "bc_post") - total(A, "bc_post")),
    bc_recv: per(total(B, "bc_recv") - total(A, "bc_recv")),
    fetches: per(total(B, "fetch") - total(A, "fetch")),
    layouts: per(b.layouts - a.layouts),
  };
}

function sources(a, b) {
  const minutes = (b.t - a.t) / MINUTE;
  const out = {};
  for (const [key, entry] of Object.entries(b.snap.timers)) {
    const fires = entry.fires - (a.snap.timers[key]?.fires ?? 0);
    if (fires) out[key] = round(fires / minutes);
  }
  for (const [key, fires] of Object.entries(b.snap.raf.src)) {
    const delta = fires - (a.snap.raf.src[key] ?? 0);
    if (delta) out[`rAF ${key}`] = round(delta / minutes);
  }
  return out;
}

const since = (tab, t) => tab.page.evaluate((t) => window.__idle.log_since(t), t);
const now = (tab) => tab.page.evaluate(() => performance.now());
const set_hidden = (tab, hidden) => tab.page.evaluate((hidden) => window.__idle.set_hidden(hidden), hidden);

async function leak(tab) {
  const heaps = [(await sample(tab, true)).heap_used];
  for (let cycle = 0; cycle < 3; cycle++) {
    const ids = [];
    for (const id of LEAK_APPS) {
      ids.push(await tab.page.evaluate((id) => window.kernel.service("apps").launch(id), id).catch((error) => `ERR ${error.message}`));
      await sleep(1200);
    }
    await sleep(2000);
    await tab.page.evaluate((ids) => {
      for (const id of ids) if (typeof id === "string" && !id.startsWith("ERR")) window.kernel.service("windows").force_close(id);
    }, ids);
    await sleep(4000);
    heaps.push((await sample(tab, true)).heap_used);
  }
  return heaps;
}

const SCENARIOS = {
  async visible(context, url, minutes) {
    return SCENARIOS.idle(context, url, minutes, false);
  },
  async hidden(context, url, minutes) {
    return SCENARIOS.idle(context, url, minutes, true);
  },
  async idle(context, url, minutes, hidden) {
    const tab = await boot(await context.newPage(), url);
    await sleep(Number(opts.warmup) * 1000);
    const heap_boot = (await sample(tab, true)).heap_used;
    if (hidden) await set_hidden(tab, true);
    const t0 = await now(tab);
    const a = await sample(tab);
    await sleep(minutes * MINUTE);
    const b = await sample(tab);
    const log = await since(tab, t0);
    if (hidden) await set_hidden(tab, false);
    const heap_idle = (await sample(tab, true)).heap_used;
    const row = {
      ...rates(a, b),
      load_timers: total(a.snap, "timers"),
      load_locks: total(a.snap, "locks"),
      load_opfs_ops: total(a.snap, "opfs"),
      load_bc_post: total(a.snap, "bc_post"),
      load_fetches: total(a.snap, "fetch"),
      heap_boot_mb: round(heap_boot / 1e6),
      heap_idle_mb: round(heap_idle / 1e6),
      idle_growth_kb: round((heap_idle - heap_boot) / 1e3),
    };
    if (!hidden) {
      const heaps = await leak(tab);
      Object.assign(row, { leak_c1_mb: round((heaps[1] - heaps[0]) / 1e6), leak_c2_kb: round((heaps[2] - heaps[1]) / 1e3), leak_c3_kb: round((heaps[3] - heaps[2]) / 1e3) });
    }
    return [{ scenario: hidden ? "hidden" : "visible", ...row, sources: sources(a, b), log }];
  },
  async twotab(context, url, minutes) {
    const a = await boot(await context.newPage(), url);
    await sleep(15000);
    const b = await boot(await context.newPage(), url, 3000);
    // A goes to the background as B opens in front of it, like a new tab in the same window.
    await set_hidden(a, true);
    await sleep(15000);
    const [a0, b0] = [await sample(a), await sample(b)];
    await sleep(minutes * MINUTE);
    const [a1, b1] = [await sample(a), await sample(b)];
    const switches = 10;
    for (let i = 0; i < switches; i++) {
      const [front, back] = i % 2 === 0 ? [a, b] : [b, a];
      await set_hidden(back, true);
      await set_hidden(front, false);
      await sleep(10000);
    }
    const [a2, b2] = [await sample(a), await sample(b)];
    const per_switch = (x, y, key) => round((total(y.snap, key) - total(x.snap, key)) / switches);
    const switch_row = {};
    for (const [tab, x, y] of [["a", a1, a2], ["b", b1, b2]]) {
      Object.assign(switch_row, {
        [`${tab}_locks`]: per_switch(x, y, "locks"),
        [`${tab}_opfs`]: per_switch(x, y, "opfs"),
        [`${tab}_bc_post`]: per_switch(x, y, "bc_post"),
        [`${tab}_script_ms`]: round(((y.script_s - x.script_s) * 1000) / switches),
      });
    }
    return [
      { scenario: "twotab-a-hidden", ...rates(a0, a1), sources: sources(a0, a1) },
      { scenario: "twotab-b-visible", ...rates(b0, b1), sources: sources(b0, b1) },
      { scenario: "twotab-switch", ...switch_row },
    ];
  },
  async focus(context, url) {
    const tab = await boot(await context.newPage(), url);
    await sleep(20000);
    const m0 = await sample(tab);
    for (let i = 0; i < 20; i++) {
      await tab.page.evaluate(() => {
        window.dispatchEvent(new Event("blur"));
        window.dispatchEvent(new Event("focus"));
      });
      await sleep(3000);
    }
    const m1 = await sample(tab);
    for (let i = 0; i < 10; i++) {
      await set_hidden(tab, true);
      await sleep(2000);
      await set_hidden(tab, false);
      await sleep(3000);
    }
    const m2 = await sample(tab);
    await sleep(50000);
    const m3 = await sample(tab);
    const delta = (x, y, key) => total(y.snap, key) - total(x.snap, key);
    const script = (x, y) => round((y.script_s - x.script_s) * 1000);
    return [{
      scenario: "focus",
      focus_locks_per_event: round(delta(m0, m1, "locks") / 20),
      focus_opfs_per_event: round(delta(m0, m1, "opfs") / 20),
      focus_script_ms_60s: script(m0, m1),
      vis_locks_per_cycle: round(delta(m1, m2, "locks") / 10),
      vis_opfs_per_cycle: round(delta(m1, m2, "opfs") / 10),
      vis_bc_post_per_cycle: round(delta(m1, m2, "bc_post") / 10),
      vis_fetches_per_cycle: round(delta(m1, m2, "fetch") / 10),
      vis_script_ms_50s: script(m1, m2),
      control_script_ms_50s: script(m2, m3),
    }];
  },
};

async function job(name, target) {
  const browser = await chromium.launch();
  const context = await browser.newContext(VIEWPORTS.desktop);
  await context.addInitScript(idle_instrument);
  const errors = [];
  context.on("page", (page) => collect_errors(page, errors));
  let rows;
  try {
    rows = await SCENARIOS[name](context, target.url, Number(opts.minutes));
  } catch (error) {
    rows = [{ scenario: name, error: String(error).slice(0, 300) }];
  }
  await browser.close();
  rows = rows.map((row, i) => ({ ...row, target: target.name, run: target.run, errors: [...(row.error ? [row.error] : []), ...(i === 0 ? errors : [])] }));
  for (const row of rows) console.error(`${row.scenario} ${target.name}#${target.run}: ${row.error ?? Object.entries(row).filter(([, v]) => typeof v === "number").slice(0, 8).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  return rows;
}

const { targets, stop } = await start_targets(opts);
const runs = [];
for (let run = 0; run < Number(opts.runs); run++) {
  const jobs = list(opts.scenarios).flatMap((name) => in_order(targets, run).map((target) => [name, target]));
  if (opts.serial) for (const [name, target] of jobs) runs.push(...(await job(name, target)));
  else runs.push(...(await Promise.all(jobs.map(([name, target]) => job(name, target)))).flat());
}
stop();

const fields = [...new Set(runs.flatMap((row) => Object.keys(row).filter((key) => typeof row[key] === "number" && key !== "run")))];
save(opts, "idle", { note: "rates per minute", summary: summarize(runs.filter((r) => !r.error), fields), runs });
