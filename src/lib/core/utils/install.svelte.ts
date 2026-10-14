import { detect_platform, INSTALL_HINTS, InstallPlatform } from "./install";

export { INSTALL_HINTS, InstallPlatform };

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Installing WebOS as a PWA. `main.ts` imports this before the kernel boots: Chromium fires `beforeinstallprompt`
 * once, early, and a listener added when the introduction mounts would miss it.
 */
class Installer {
  private event = $state<BeforeInstallPromptEvent | null>(null);
  private standalone = $state(false);
  private just_installed = $state(false);
  platform_hint = $state<InstallPlatform>(InstallPlatform.OTHER);

  constructor() {
    if (typeof window === "undefined") return;

    this.platform_hint = detect_platform({
      user_agent: navigator.userAgent,
      max_touch_points: navigator.maxTouchPoints,
      has_prompt_api: "onbeforeinstallprompt" in window,
    });

    const display = matchMedia("(display-mode: standalone)");
    const ios_standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    this.standalone = display.matches || ios_standalone;
    display.addEventListener("change", (event) => (this.standalone = event.matches || ios_standalone));

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.event = event as BeforeInstallPromptEvent;
    });
    window.addEventListener("appinstalled", () => {
      this.event = null;
      this.just_installed = true;
    });
  }

  get installed(): boolean {
    return this.standalone || this.just_installed;
  }

  get can_install(): boolean {
    return this.event !== null && !this.installed;
  }

  get hint(): string {
    return INSTALL_HINTS[this.platform_hint];
  }

  /** Needs a user gesture: call it from a click or a key press. */
  async install(): Promise<InstallOutcome> {
    const event = this.event;
    if (!event) return "unavailable";
    this.event = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") this.just_installed = true;
    return outcome;
  }
}

export const installer = new Installer();
