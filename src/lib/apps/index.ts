import type { AppManifest } from "$lib/core/api";
import example from "./user/example";
import kernel from "./system/kernel";
import settings from "./system/settings";

// TODO: temporary solution
export function register_apps(register: (app: AppManifest) => void): void {
  register(example);
  register(kernel);
  register(settings);
}
