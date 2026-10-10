import type { VersionInfo, VersionService as IVersionService } from "./type";

declare const __VERSION_INFO__: VersionInfo;

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes
const VISIBILITY_THROTTLE = 60 * 1000; // 1 minute

export class VersionService implements IVersionService {
  name = "VersionService";
  description = "VersionService";

  public info = $state<VersionInfo>(__VERSION_INFO__);
  public update_available = $state<VersionInfo | null>(null);
  public is_checking = $state(false);

  private last_check = 0;
  private poll_interval?: ReturnType<typeof setInterval>;

  private on_visibility_change = () => {
    if (document.visibilityState === "visible" && Date.now() - this.last_check > VISIBILITY_THROTTLE) {
      this.check();
    }
  };

  init() {
    this.poll_interval = setInterval(() => this.check(), POLL_INTERVAL);
    document.addEventListener("visibilitychange", this.on_visibility_change);
  }

  destroy() {
    clearInterval(this.poll_interval);
    document.removeEventListener("visibilitychange", this.on_visibility_change);
  }

  to_string(): string {
    return `VersionService: v${this.info.version} (${this.info.commit})`;
  }

  async check(): Promise<void> {
    if (this.is_checking) return;
    this.is_checking = true;
    this.last_check = Date.now();

    try {
      const response = await fetch("/version.json", { cache: "no-store" });
      if (!response.ok) return;

      const remote: VersionInfo = await response.json();
      if (remote.buildTimestamp > this.info.buildTimestamp) {
        this.update_available = remote;
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    } finally {
      this.is_checking = false;
    }
  }

  async apply_update(): Promise<void> {
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }
      window.location.reload();
    } catch (error) {
      console.error("Failed to apply update:", error);
    }
  }
}
