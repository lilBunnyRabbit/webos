import { boot_settled, chromium, collect_errors, in_order, list, parse_args, raw_metrics, round, save, start_targets, summarize, throttle, VIEWPORTS } from "./lib.mjs";
import { frame_recorder } from "./probe.mjs";

const USAGE = `Frame times, long tasks and main-thread ms per interaction, after the intro is skipped.
  node scripts/perf/interaction.mjs --base=<url|dir> --head=<url|dir> [--runs=5] [--rates=1,4]
    [--modes=desktop,mobile,switch]
      desktop  marquee, open_window, drag, resize, maximize, minimize, launcher_type, palette_toast, toast_out,
               notif_center, then 10 windows: switch_10, drag_10, launcher_type_10, settings_nav
      mobile   m_drawer_open, m_drawer_type, m_open_app, m_home, m_switcher, m_drawer_close
      switch   focus switching between window pairs (ai_pair: calculator/ask, plain_pair: calculator/text-editor), launcher open/close
    [--only=drag,resize]   only these scenarios
    [--block-version]      abort version.json so an update toast can't land mid-run
Writes interaction.json; report: node scripts/perf/report.mjs <out>/interaction.json`;

const opts = parse_args(USAGE, { runs: "5", rates: "1,4", modes: "desktop,mobile,switch" });
const only = opts.only ? list(opts.only) : null;
const TEN = ["ask", "text-editor", "terminal", "file-explorer", "activity-monitor", "kernel", "app-library", "csv-viewer", "style-guide"];
const PAIRS = 40;

async function record(page, cdp, name, action, tail = 400) {
  if (only && !only.includes(name)) {
    // Skipped scenarios still run unmeasured: later ones depend on the windows and state they leave behind.
    await action().catch(() => {});
    return null;
  }
  const m0 = await raw_metrics(cdp);
  await page.evaluate(() => window.__frames.start());
  const started = Date.now();
  try {
    await action();
  } catch (error) {
    return { name, error: String(error).slice(0, 200) };
  }
  await page.waitForTimeout(tail);
  const wall = Date.now() - started;
  const { frames, long, loaf } = await page.evaluate(() => window.__frames.stop());
  const m1 = await raw_metrics(cdp);
  const ms = (key) => round((m1[key] - m0[key]) * 1000);
  const sorted = [...frames].sort((a, b) => a - b);
  const at = (q) => (sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]) : null);
  return {
    name,
    wall,
    frames: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted.length ? round(sorted.at(-1)) : null,
    janky: sorted.filter((f) => f > 34).length,
    lt_n: long.length,
    lt_sum: Math.round(long.reduce((a, b) => a + b, 0)),
    lt_max: Math.round(Math.max(0, ...long)),
    script: ms("ScriptDuration"),
    layout: ms("LayoutDuration"),
    style: ms("RecalcStyleDuration"),
    task: ms("TaskDuration"),
    layouts: m1.LayoutCount - m0.LayoutCount,
    styles: m1.RecalcStyleCount - m0.RecalcStyleCount,
    nodes: m1.Nodes,
    loaf: loaf.filter((frame) => frame.d >= 50).slice(0, 6),
  };
}

const window_count = (page) => page.locator("[data-window-id]").count();

async function open_app(page, id) {
  const before = await window_count(page);
  await page.evaluate((id) => (location.hash = `#/app/${id}`), id);
  await page.waitForFunction((n) => document.querySelectorAll("[data-window-id]").length > n, before, { timeout: 15000 });
}

function top_window(page) {
  return page.evaluate(() => {
    const windows = [...document.querySelectorAll("[data-window-id]")].filter((el) => getComputedStyle(el).display !== "none");
    windows.sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
    const rect = windows[0].getBoundingClientRect();
    return { id: windows[0].dataset.windowId, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  });
}

const focus_window = (page, id) => page.evaluate((id) => document.querySelector(`[data-window-id="${id}"]`)?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), id);

async function drag_title(page, offset, steps, dx, dy) {
  const w = await top_window(page);
  const x = offset ?? w.w / 2;
  await page.mouse.move(w.x + x, w.y + 15);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(w.x + x + i * dx, w.y + 15 + i * dy);
  await page.mouse.up();
}

async function desktop(page, cdp) {
  const results = [];
  const push = (result) => result && results.push(result);
  // The marquee runs first, while no window covers the empty desktop.
  push(await record(page, cdp, "marquee", async () => {
    await page.mouse.move(500, 200);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(500 + i * 12, 200 + i * 8);
    await page.mouse.up();
  }));
  push(await record(page, cdp, "open_window", () => open_app(page, "calculator"), 700));
  push(await record(page, cdp, "drag", () => drag_title(page, null, 60, 6, 3)));
  push(await record(page, cdp, "resize", async () => {
    const w = await top_window(page);
    await page.mouse.move(w.x + w.w - 1, w.y + w.h - 1);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(w.x + w.w - 1 + i * 5, w.y + w.h - 1 + i * 4);
    await page.mouse.up();
  }));
  push(await record(page, cdp, "maximize", async () => {
    const w = page.locator(`[data-window-id="${(await top_window(page)).id}"]`);
    await w.getByRole("button", { name: "Maximize" }).click();
    await page.waitForTimeout(700);
    await w.getByRole("button", { name: "Restore" }).click();
  }, 700));
  push(await record(page, cdp, "minimize", async () => {
    const w = page.locator(`[data-window-id="${(await top_window(page)).id}"]`);
    await w.getByRole("button", { name: "Minimize" }).click();
    await page.waitForTimeout(700);
    await page.locator('[aria-label="Taskbar"]').getByRole("button", { name: /Calculator/ }).first().click();
  }, 700));
  push(await record(page, cdp, "launcher_type", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(300);
    await page.keyboard.type("settngs", { delay: 60 });
    for (let i = 0; i < 7; i++) await page.keyboard.press("Backspace", { delay: 40 });
    await page.keyboard.type("calendar", { delay: 60 });
    await page.keyboard.press("Escape");
  }, 500));
  push(await record(page, cdp, "palette_toast", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(300);
    await page.keyboard.type("> notify hello there", { delay: 30 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
  }, 600));
  push(await record(page, cdp, "toast_out", () => page.waitForTimeout(5200), 300));
  push(await record(page, cdp, "notif_center", async () => {
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
  }, 500));
  for (const id of TEN) {
    await open_app(page, id).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1500);
  push(await record(page, cdp, "switch_10", async () => {
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-window-id]")].map((el) => el.dataset.windowId));
    for (let k = 0; k < 2; k++) {
      for (const id of ids) {
        await focus_window(page, id);
        await page.waitForTimeout(120);
      }
    }
  }));
  push(await record(page, cdp, "drag_10", () => drag_title(page, 80, 60, 4, 3)));
  push(await record(page, cdp, "launcher_type_10", async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(300);
    await page.keyboard.type("settngs", { delay: 60 });
    await page.keyboard.press("Escape");
  }, 500));
  push(await record(page, cdp, "settings_nav", async () => {
    await open_app(page, "settings");
    await page.waitForTimeout(1000);
    const links = page.locator(`[data-window-id="${(await top_window(page)).id}"]`).locator("nav a, nav button, [role=tab]");
    const count = Math.min(6, await links.count());
    for (let i = 0; i < count; i++) {
      await links.nth(i).click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }));
  return results;
}

async function mobile(page, cdp) {
  const results = [];
  const push = (result) => result && results.push(result);
  const running = () => page.getByRole("button", { name: /^Running apps/ });
  push(await record(page, cdp, "m_drawer_open", async () => {
    await page.getByRole("button", { name: "All apps" }).tap();
    await page.getByRole("dialog").first().waitFor({ timeout: 5000 });
  }, 600));
  push(await record(page, cdp, "m_drawer_type", async () => {
    await page.getByLabel("Search apps").first().tap();
    await page.keyboard.type("settngs", { delay: 60 });
    for (let i = 0; i < 7; i++) await page.keyboard.press("Backspace", { delay: 40 });
    await page.keyboard.type("calc", { delay: 60 });
  }, 400));
  push(await record(page, cdp, "m_open_app", async () => {
    await page.getByRole("dialog").getByRole("button", { name: /Calculator/ }).first().tap();
    await page.waitForFunction(() => document.querySelectorAll("[data-window-id]").length > 0, null, { timeout: 8000 }).catch(() => {});
  }, 800));
  push(await record(page, cdp, "m_home", () => page.getByRole("button", { name: "Home" }).tap(), 800));
  push(await record(page, cdp, "m_switcher", async () => {
    await running().tap();
    await page.waitForTimeout(700);
    await running().tap();
  }, 800));
  push(await record(page, cdp, "m_drawer_close", async () => {
    await page.getByRole("button", { name: "All apps" }).tap();
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
  }, 600));
  return results;
}

async function switching(page, cdp) {
  const results = [];
  const wanted = (name) => !only || only.includes(name);
  const dom = await page.evaluate(() => ({ total: document.querySelectorAll("*").length, taskbar: document.querySelector('[aria-label="Taskbar"]')?.querySelectorAll("*").length ?? -1, svg: document.querySelectorAll("svg").length }));
  for (const id of ["calculator", "ask", "text-editor"]) {
    await open_app(page, id);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(1500);
  const ids = await page.evaluate(() => [...document.querySelectorAll("[data-window-id]")].map((el) => el.dataset.windowId));
  const cost = async (name, action) => {
    if (!wanted(name)) return action();
    const m0 = await raw_metrics(cdp);
    await action();
    const m1 = await raw_metrics(cdp);
    const ms = (key) => round((m1[key] - m0[key]) * 1000);
    results.push({ name, script: ms("ScriptDuration"), style: ms("RecalcStyleDuration"), task: ms("TaskDuration"), dom_total: dom.total, dom_taskbar: dom.taskbar, svg: dom.svg });
  };
  const pair = (a, b) => async () => {
    for (let i = 0; i < PAIRS; i++) {
      for (const id of [a, b]) {
        await focus_window(page, id);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      }
    }
  };
  await cost("ai_pair", pair(ids[0], ids[1]));
  await cost("plain_pair", pair(ids[0], ids[2]));
  await cost("launcher", async () => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("ControlOrMeta+k");
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  });
  return results;
}

const MODES = { desktop: { viewport: "desktop", run: desktop }, mobile: { viewport: "mobile", query: "?platform=mobile", run: mobile }, switch: { viewport: "desktop", run: switching } };

const { targets, stop } = await start_targets(opts);
const browser = await chromium.launch();
const runs = [];
for (let run = 0; run < Number(opts.runs); run++) {
  for (const mode of list(opts.modes)) {
    for (const rate of list(opts.rates).map(Number)) {
      for (const item of in_order(targets, run)) {
        const spec = MODES[mode];
        const context = await browser.newContext({ ...VIEWPORTS[spec.viewport], serviceWorkers: "block" });
        await context.addInitScript(frame_recorder);
        if (opts["block-version"]) await context.route("**/version.json", (route) => route.abort());
        const page = await context.newPage();
        const errors = [];
        collect_errors(page, errors);
        const cdp = await context.newCDPSession(page);
        await cdp.send("Performance.enable");
        let results;
        try {
          await boot_settled(page, item.url + (spec.query ?? ""));
          await throttle(cdp, rate);
          results = await spec.run(page, cdp);
        } catch (error) {
          results = [{ name: "fatal", error: String(error).slice(0, 300) }];
        }
        await context.close();
        const page_errors = opts["block-version"] ? errors.filter((e) => !/Failed to check for updates|ERR_FAILED/.test(e)) : errors;
        results.forEach((result, i) => runs.push({ scenario: `${mode}/${result.name}@${rate}x`, target: item.name, run: item.run, ...result, errors: [...(result.error ? [result.error] : []), ...(i === 0 ? page_errors : [])] }));
        console.error(`${mode} ${rate}x ${item.name}#${item.run}: ${results.map((r) => `${r.name}:${r.error ? "ERR" : (r.p95 ?? r.script)}`).join(" ")}`);
      }
    }
  }
}
await browser.close();
stop();

const fields = ["wall", "p50", "p95", "max", "janky", "lt_n", "lt_sum", "lt_max", "script", "style", "layout", "task"];
save(opts, "interaction", { summary: summarize(runs.filter((r) => !r.error), fields), runs });
