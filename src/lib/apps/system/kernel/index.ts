import { define_app } from "$lib/core/api";
import { Brain as BrainIcon } from "phosphor-svelte";

export default define_app({
  id: "kernel",
  name: "Kernel",
  icon: BrainIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./kernel.app.svelte"),
});
