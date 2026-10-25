import { Mode } from "$lib/core/api/kernel/mode";
import type { Platform } from "$lib/core/api/kernel/platform";
import type { AnalyticsConsent } from "$lib/core/api/services/settings/type";

/** Mirror of the settings answer: `index.html` reads it before gtag's `config`, long before OPFS is readable (ADR-070). */
export const ANALYTICS_CONSENT_KEY = "webos.analytics";

type Gtag = (...args: unknown[]) => void;

export interface LaunchEvent {
  app_id: string;
  mode: "desktop" | "solo";
  platform: Platform;
}

export function launch_event(app_id: string, mode: Mode, platform: Platform): LaunchEvent {
  return { app_id, mode: mode === Mode.SOLO ? "solo" : "desktop", platform };
}

interface AnalyticsGlobals {
  gtag?: Gtag;
  /** Defined by `index.html` outside development and localhost; creates gtag and loads the script once. */
  webos_load_analytics?: () => void;
}

// Missing in tests, in development, on localhost, and until the visitor allows it.
function gtag(): Gtag | undefined {
  return (globalThis as AnalyticsGlobals).gtag;
}

export function track_launch(app_id: string, mode: Mode, platform: Platform): void {
  gtag()?.("event", "app_open", launch_event(app_id, mode, platform));
}

/** Mirrors the stored answer for `index.html`'s next load, then applies it to this page. */
export function apply_consent(answer: AnalyticsConsent): void {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, answer);
  } catch (error) {
    console.warn("[analytics] Couldn't mirror the answer", error);
  }
  set_consent(answer);
}

/** "allowed" loads gtag now; any other answer stops what this page already loaded, and the next load never loads it. */
export function set_consent(answer: AnalyticsConsent): void {
  if (answer === "allowed") {
    (globalThis as AnalyticsGlobals).webos_load_analytics?.();
    gtag()?.("consent", "update", { analytics_storage: "granted" });
    return;
  }
  gtag()?.("consent", "update", { analytics_storage: "denied" });
}
