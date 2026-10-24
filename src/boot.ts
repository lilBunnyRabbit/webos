// The gate before WebOS (ADR-067): an engine that can't parse or run the main bundle still gets told why. Keep this and
// what it imports small, and free of syntax older engines can't parse.
import { detect_browser } from "./lib/core/compat/browser";
import { check, in_scope, should_show, solo_app } from "./lib/core/compat/check";
import { FEATURES } from "./lib/core/compat/features";
import { read_dismissed } from "./lib/core/compat/storage";

const browser = detect_browser();
const app = solo_app(location.hash);
const results = check(FEATURES, browser).filter((result) => in_scope(result.feature, app));

async function warn(error?: string) {
  const { show_compat_screen } = await import("./lib/core/compat/screen");
  show_compat_screen({ results, browser, app, error, on_continue: start });
}

async function start() {
  try {
    await import("./main");
  } catch (error) {
    console.error("WebOS failed to load:", error);
    warn(error instanceof Error ? error.message : String(error));
  }
}

if (should_show(results, read_dismissed())) warn();
else start();
