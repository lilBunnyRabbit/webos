import { mount, unmount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import kernel from "./lib/core/api";

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

main()
  .then(() => {
    console.log("Application initialized", kernel);
  })
  .catch((error) => {
    console.error("Failed to initialize application:", error);
  });
