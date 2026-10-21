import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_BYTES = 190_000;
const DIST = "dist";

const html = readFileSync(join(DIST, "index.html"), "utf8");
// The entry and the chunks it imports statically (`core`, `app-boot`), which Vite preloads next to it.
const entries = [
  ...html.matchAll(/<(?:script type="module"[^>]+src|link rel="modulepreload"[^>]+href)="[^"]*?(assets\/[^"]+\.js)"/g),
].map((match) => match[1]);
if (entries.length === 0) {
  console.error("boot budget: no entry script in dist/index.html, run the build first");
  process.exit(1);
}

let total = 0;
for (const entry of entries) {
  const size = gzipSync(readFileSync(join(DIST, entry))).length;
  total += size;
  console.log(`${entry}  ${(size / 1000).toFixed(1)} KB gz`);
}

const verdict = total <= BUDGET_BYTES ? "ok" : "over";
console.log(`boot budget: ${(total / 1000).toFixed(1)} / ${BUDGET_BYTES / 1000} KB gz, ${verdict}`);
if (total > BUDGET_BYTES) process.exit(1);
