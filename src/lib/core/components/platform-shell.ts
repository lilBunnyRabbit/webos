import { Mode } from "$lib/core/api/kernel/mode";
import { Platform } from "$lib/core/api/kernel/platform";

/** The one shell branch: solo (ADR-047) on any platform, else per platform (ADR-016). Lazy, so a device only downloads its own shell (ADR-036). */
export function load_shell(platform: Platform, mode: Mode) {
  if (mode === Mode.SOLO) return import("./solo/solo-shell.svelte");
  return platform === Platform.MOBILE ? import("./mobile/mobile-shell.svelte") : import("./desktop-shell.svelte");
}
