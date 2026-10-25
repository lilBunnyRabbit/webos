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

// Missing in tests, in development, on localhost and when index.html's script didn't run.
function gtag(): Gtag | undefined {
  return (globalThis as { gtag?: Gtag }).gtag;
}

export function track_launch(app_id: string, mode: Mode, platform: Platform): void {
  gtag()?.("event", "app_open", launch_event(app_id, mode, platform));
}

export function set_consent(answer: AnalyticsConsent): void {
  gtag()?.("consent", "update", { analytics_storage: answer === "allowed" ? "granted" : "denied" });
}
