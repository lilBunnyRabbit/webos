import { untrack } from "svelte";
import type { AppsService, ClipboardService, Kernel, NotificationsService, SessionService, WindowId, WindowsService } from "$lib/core/api";
import { SessionStatus } from "../session/type";
import { is_shareable, parse_hash, serialize_route, type Route } from "./route";
import { LinkOutcome, type RouterService as IRouterService } from "./type";
import { router_shell } from "./shell";

export class RouterService implements IRouterService {
  name = "RouterService";
  description = "Opens app links from the URL and copies links to windows";
  inspector = () => import("./inspector.svelte");
  shell = () => router_shell(this, () => this.windows_service);

  to_string(): string {
    return `RouterService: ${this.last_link ? `${this.last_link.hash} (${this.last_link.outcome})` : "no link handled"}`;
  }

  public last_link = $state<{ hash: string; outcome: LinkOutcome } | null>(null);

  private windows_service!: WindowsService;
  private apps_service!: AppsService;
  private session_service!: SessionService;
  private clipboard_service!: ClipboardService;
  private notifications_service!: NotificationsService;

  private dispose_wait?: () => void;

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.session_service = $derived(this.kernel.service<SessionService>("session"));
    this.clipboard_service = $derived(this.kernel.service<ClipboardService>("clipboard"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
  }

  init(): void {
    window.addEventListener("hashchange", this.consume);
    // The Restore answer comes first, so a link opens on top of the restored windows instead of under the dialog.
    this.dispose_wait = $effect.root(() => {
      $effect(() => {
        if (this.session_service.status !== SessionStatus.PENDING) untrack(this.consume);
      });
    });
  }

  destroy(): void {
    window.removeEventListener("hashchange", this.consume);
    this.dispose_wait?.();
  }

  public link_for(id: WindowId): string | null {
    const instance = this.windows_service.get(id);
    if (!instance || !is_shareable(instance.app.manifest)) return null;

    const hash = serialize_route({ kind: "app", id: instance.app.id, props: instance.app.props });
    return `${location.origin}${location.pathname}${hash}`;
  }

  public async copy_link(id: WindowId): Promise<void> {
    const link = this.link_for(id);
    if (!link) return;

    try {
      await this.clipboard_service.copy_text(link);
      this.notifications_service.notify("router", { type: "info", title: "Link copied", message: link });
    } catch (error) {
      console.error("[RouterService] Copy failed:", error);
      this.notifications_service.notify("router", { type: "error", title: "Couldn't copy the link" });
    }
  }

  private consume = (): void => {
    if (this.session_service.status === SessionStatus.PENDING) return;

    const hash = location.hash;
    if (!hash.startsWith("#/")) return;
    // Consumed: a reload must not open the app a second time next to the restored session.
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);

    const route = parse_hash(hash);
    this.last_link = { hash, outcome: route ? this.open(route) : LinkOutcome.NOT_A_LINK };
    if (!route) this.notifications_service.notify("router", { type: "error", title: "This link isn't one WebOS knows" });
  };

  private open(route: Route): LinkOutcome {
    const manifest = this.apps_service.get(route.id);
    if (!manifest) {
      this.notifications_service.notify("router", { type: "error", title: "The link points to an app that doesn't exist", message: route.id });
      return LinkOutcome.UNKNOWN_APP;
    }

    // launch() would open the app without its data; a link with bad data opens nothing.
    if (route.props !== undefined && !manifest.props?.safeParse(route.props).success) {
      this.notifications_service.notify("router", { type: "error", title: `The link to ${manifest.name} is broken`, message: "Its data doesn't fit the app." });
      return LinkOutcome.INVALID_PROPS;
    }

    this.apps_service.launch(route.id, route.props);
    return LinkOutcome.OPENED;
  }
}
