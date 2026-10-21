import { readFileSync } from "node:fs";

const USAGE = `Markdown table of base vs head from one or more result files.
  node scripts/perf/report.mjs <out>/boot.json [<out>/idle.json …] [--a=base] [--b=head] [--steps] [--changed] [--only=<regexp>]
    --steps     boot.json: per-service init times instead of the summary
    --changed   only rows whose medians differ
    --only      only scenarios or metrics matching the pattern`;

const opts = { a: "base", b: "head" };
const files = [];
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) files.push(arg);
  else {
    const [key, ...rest] = arg.slice(2).split("=");
    opts[key] = rest.length ? rest.join("=") : "true";
  }
}
if (opts.help || files.length === 0) {
  console.log(USAGE);
  process.exit(opts.help ? 0 : 1);
}

const only = opts.only ? new RegExp(opts.only) : null;
const fmt = (s) => (s ? `${s.median} [${s.min}–${s.max}]` : "–");

for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const source = opts.steps ? data.steps : data.summary;
  if (!source) continue;
  const keys = Object.keys(source);
  const has_b = keys.some((key) => key.endsWith(`|${opts.b}`));
  const has_a = keys.some((key) => key.endsWith(`|${opts.a}`));
  const both = has_a && has_b;
  const single = has_b ? opts.b : opts.a;
  const runs = (key) => Object.values(source[key] ?? {}).find(Boolean)?.n ?? 0;

  console.log(`\n### ${file.split("/").pop()}${data.note ? ` (${data.note})` : ""}\n`);
  console.log(both ? `| scenario | metric | ${opts.a} | ${opts.b} | Δ median | spread overlaps |\n|---|---|---|---|---|---|` : `| scenario | metric | ${single} |\n|---|---|---|`);
  const scenarios = [...new Set(keys.map((key) => key.slice(0, key.lastIndexOf("|"))))];
  for (const scenario of scenarios) {
    const a = source[`${scenario}|${opts.a}`] ?? {};
    const b = source[`${scenario}|${opts.b}`] ?? {};
    const label = `${scenario} (n=${both ? `${runs(`${scenario}|${opts.a}`)}/${runs(`${scenario}|${opts.b}`)}` : runs(`${scenario}|${single}`)})`;
    for (const metric of Object.keys(both ? b : source[`${scenario}|${single}`])) {
      if (only && !only.test(scenario) && !only.test(metric)) continue;
      if (!both) {
        const value = source[`${scenario}|${single}`][metric];
        if (value) console.log(`| ${label} | ${metric} | ${fmt(value)} |`);
        continue;
      }
      const [x, y] = [a[metric], b[metric]];
      if (!x || !y) continue;
      const delta = Math.round((y.median - x.median) * 10) / 10;
      if (opts.changed && delta === 0) continue;
      const overlap = y.min <= x.max && x.min <= y.max;
      console.log(`| ${label} | ${metric} | ${fmt(x)} | ${fmt(y)} | ${delta > 0 ? "+" : ""}${delta} | ${overlap ? "yes" : "**no**"} |`);
    }
  }
  const errors = (data.runs ?? []).flatMap((run) => (run.errors ?? []).map((error) => `${run.target} ${run.scenario}: ${error}`));
  if (errors.length) console.log(`\nErrors (${errors.length}):\n${[...new Set(errors)].slice(0, 10).map((e) => `- ${e}`).join("\n")}`);
}
