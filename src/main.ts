import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import kernel from "./lib/core/api";

async function main() {
  // Initialize the kernel before mounting the app
  await kernel.init();

  // TODO: intro
  const app = mount(App, {
    target: document.getElementById("app")!,
    intro: true
  });

  document.getElementById("splash")?.remove();

  return app;
}

// Start the application
main()
  .then(() => {
    console.log("Application initialized", kernel);
  })
  .catch((error) => {
    console.error("Failed to initialize application:", error);
  });
