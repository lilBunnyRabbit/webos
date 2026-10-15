import { Platform } from "$lib/core/api/kernel/platform";

/** The one platform branch (ADR-016). Lazy, so a device only downloads its own shell (ADR-036). */
export function load_shell(platform: Platform) {
  return platform === Platform.MOBILE ? import("./mobile/mobile-shell.svelte") : import("./desktop-shell.svelte");
}
