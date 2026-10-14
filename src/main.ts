import { mount, unmount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import kernel from "./lib/core/api";
import "./lib/core/utils/install.svelte";

async function main() {
  await kernel.init();

  // TODO: intro
  const app = mount(App, {
    target: document.getElementById("app")!,
    intro: true
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

  const message = document.createElement("p");
  message.textContent = `WebOS failed to start: ${error instanceof Error ? error.message : String(error)}`;
  // The theme never loaded, so this uses the Brand Dark error token directly.
  message.style.cssText = "margin: 0; padding: 0 1rem; max-width: 40rem; text-align: center; font: 14px ui-monospace, monospace; color: oklch(0.745 0.1398 30)";

  splash.style.alignContent = "center";
  splash.style.gap = "1.5rem";
  splash.append(message);
}

main().catch((error) => {
  console.error("Failed to initialize application:", error);
  show_boot_error(error);
});
