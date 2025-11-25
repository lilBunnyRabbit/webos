import type { AppManifest } from "$lib/core/api";
import example from "./user/example";

export function register_apps(register: (app: AppManifest) => void): void {
  register(example);
}
