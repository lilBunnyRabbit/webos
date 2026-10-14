export * from "./type";
import type { DialogsService, Kernel, MobileWindowsService, WindowsService } from "$lib/core/api";
import { Platform } from "../../kernel/platform";
import { view_transition } from "$lib/core/utils/view-transition";
import type { UiOverlay, UiService as IUiService } from "./type";

const GUARD = { webos: "back-guard" };

export class UiService implements IUiService {
  name = "UiService";
  description = "Shell overlay state and back: launcher, switcher, notification center, the browser's back";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `UiService: ${this.overlay ?? "nothing"} open, back guard ${this.armed ? "armed" : "not armed"}`;
  }

  public overlay = $state<UiOverlay | null>(null);
  public armed = $state(false);

  private windows_service!: WindowsService;
  private dialogs_service!: DialogsService;

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
  }

  init(): void {
    // Chrome's back skips entries pushed without user activation, so the guard goes in on a gesture, never at boot.
    window.addEventListener("pointerup", this.arm, { capture: true });
    window.addEventListener("keydown", this.arm, { capture: true });
    window.addEventListener("popstate", this.on_popstate);
  }

  destroy(): void {
    window.removeEventListener("pointerup", this.arm, { capture: true });
    window.removeEventListener("keydown", this.arm, { capture: true });
    window.removeEventListener("popstate", this.on_popstate);
  }

  public open(overlay: UiOverlay): void {
    this.overlay = overlay;
  }

  public close(): void {
    this.overlay = null;
  }

  public toggle(overlay: UiOverlay): void {
    this.overlay = this.overlay === overlay ? null : overlay;
  }

  public back(): boolean {
    if (this.overlay) {
      view_transition(() => this.close());
      return true;
    }

    const dialog = this.dialogs_service.system.at(-1);
    if (dialog) {
      if (dialog.dismissible) dialog.resolve(null);
      return true;
    }

    const focused = this.windows_service.get_focused();
    if (!focused) return false;

    const sheet = this.dialogs_service.for_window(focused).at(-1);
    if (sheet) {
      if (sheet.dismissible) sheet.resolve(null);
      return true;
    }

    if (this.windows_service.back(focused)) return true;
    if (this.kernel.platform !== Platform.MOBILE) return false;

    const windows = this.windows_service as MobileWindowsService;
    view_transition(() => windows.go_home());
    return true;
  }

  private arm = (): void => {
    if (this.armed) return;
    history.pushState(GUARD, "");
    this.armed = true;
  };

  private on_popstate = (): void => {
    // A pasted deep link navigates too; that one is the router's.
    if (location.hash.startsWith("#/")) return;
    this.armed = false;
    this.back();
  };
}
