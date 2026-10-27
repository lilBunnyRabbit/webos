import type { Kernel, NotificationsService, WindowId, WindowsService } from "$lib/core/api";
import { RouteKind, route_url, shareable_props } from "../router/route";
import { AppsService } from "./service.svelte";
import type { AppId, LaunchOptions } from "./type";

/** A solo link (ADR-047) opens exactly one window; anything else points to the full OS instead. */
export class SoloAppsService extends AppsService {
  override name = "SoloAppsService";
  override description = "Solo mode: one app window, nothing else launches or installs";

  private solo_windows!: WindowsService;
  private solo_notifications!: NotificationsService;

  constructor(kernel: Kernel) {
    super(kernel);
    this.solo_windows = $derived(kernel.service<WindowsService>("windows"));
    this.solo_notifications = $derived(kernel.service<NotificationsService>("notifications"));
  }

  // Opening an app from a shared link isn't the intent to keep it in the person's own WebOS (ADR-040).
  override install(): AppId[] {
    return [];
  }

  // A shared link's app isn't one the person opened in their own WebOS: the list stays empty and nothing is saved.
  protected override async load_recent(): Promise<void> {}

  protected override remember(): void {}

  protected override offer_install(): void {}

  override launch(id: AppId, props?: unknown, options?: LaunchOptions): WindowId | null {
    const current = this.solo_windows.list()[0];
    if (!current) return super.launch(id, props, options);

    const instance = this.solo_windows.get(current)!;
    const url = route_url({ kind: RouteKind.APP, id: instance.app.id, props: shareable_props(instance.app.props).props });
    this.solo_notifications.notify("apps", {
      title: "Open WebOS to use other apps",
      message: "This link shows one app on its own.",
      actions: [{ label: "Open WebOS", on_click: () => void window.open(url, "_blank") }],
    });
    this.solo_windows.focus(current);
    return current;
  }
}
