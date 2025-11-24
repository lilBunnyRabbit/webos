import { Kernel } from "./kernel.svelte";
import { ExampleService } from "./example.service.svelte";
import { WindowsService } from "./services/windows/service.svelte";

export const kernel = new Kernel();

kernel.register("example", {
  instance: ExampleService,
  dependencies: [],
});

kernel.register("windows", {
  instance: WindowsService,
  dependencies: [],
});