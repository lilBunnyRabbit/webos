import { Kernel } from "./kernel.svelte";
import { ExampleService } from "./example.service.svelte";

export const kernel = new Kernel();

kernel.register("example", {
  instance: ExampleService,
  dependencies: [],
});
