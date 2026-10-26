import { mount, unmount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import kernel, { type AppsService, type BootStep, type DesktopService } from "./lib/core/api";
import { register_default_services } from "./lib/core/api/kernel/init";
import { load_shell } from "./lib/core/components/platform-shell";
import "./lib/core/utils/install.svelte";

const STEP_LABELS: Record<string, string> = {
  files: "Files",
  settings: "Settings",
  windows: "Windows",
  notifications: "Notifications",
  dialogs: "Dialogs",
  apps: "Apps",
  desktop: "Desktop",
  session: "Session",
  clipboard: "Clipboard",
  ui: "Interface",
  shell: "Shell",
  shortcuts: "Shortcuts",
  scheduler: "Alarms",
  tasks: "Tasks",
  offline: "Offline apps",
  backup: "Backup",
  ai: "On-device AI",
  speech: "Speech",
  extract: "Windows",
  router: "Links",
  version: "Updates",
};

function show_step({ key, done, total }: BootStep) {
  const bar = document.getElementById("splash-bar");
  const label = document.getElementById("splash-label");
  if (bar) bar.style.transform = `scaleX(${done / total})`;
  if (label) label.textContent = STEP_LABELS[key] ?? key;
}

/** Chunks the first screen needs, fetched while the remaining services init. A failed warm is ignored: mount imports again. */
const warmers: Record<string, () => void> = {
  desktop: () => {
    const apps = kernel.service<AppsService>("apps");
    for (const item of kernel.service<DesktopService>("desktop").items()) {
      if (item.kind === "widget")
        apps
          .get(item.app_id)
          ?.widget?.()
          .catch(() => {});
    }
  },
};

function warm() {
  for (const [key, run] of Object.entries(warmers)) {
    if (!kernel.services.has(key)) continue;
    delete warmers[key];
    run();
  }
}

async function main() {
  const [, { default: shell }] = await Promise.all([
    register_default_services(kernel).then(() =>
      kernel.init((step) => {
        show_step(step);
        warm();
      })
    ),
    load_shell(kernel.platform, kernel.mode),
  ]);

  // TODO: intro
  const app = mount(App, {
    target: document.getElementById("app")!,
    props: { shell },
    intro: true,
  });

  document.getElementById("splash")?.remove();

  // A persisted pagehide may come back from bfcache, so services must stay alive for it.
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) kernel.shutdown();
  });

  import.meta.hot?.dispose(() => {
    unmount(app);
    kernel.shutdown();
  });

  return app;
}

function show_boot_error(error: unknown) {
  const splash = document.getElementById("splash");
  if (!splash) return;

  document.getElementById("splash-progress")?.remove();

  const message = document.createElement("p");
  message.textContent = `WebOS failed to start: ${error instanceof Error ? error.message : String(error)}`;
  // The theme never loaded, so this uses the Brand Dark error token directly.
  message.style.cssText =
    "margin: 0; padding: 0 1rem; max-width: 40rem; text-align: center; font: 14px ui-monospace, monospace; color: oklch(0.745 0.1398 30)";

  splash.style.alignContent = "center";
  splash.style.gap = "1.5rem";
  splash.append(message);
}

main().catch((error) => {
  console.error("Failed to initialize application:", error);
  show_boot_error(error);
});
