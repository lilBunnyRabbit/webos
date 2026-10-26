import { untrack } from "svelte";
import type { AppsService, ClipboardService, Kernel, NotificationsService, SessionService, WindowId, WindowsService } from "$lib/core/api";
import { SessionStatus } from "../session/type";
import { Mode, detect_mode } from "../../kernel/mode";
import { RouteKind, parse_hash, route_url, shareable_props, type Route } from "./route";
import { LinkOutcome, type RouterService as IRouterService } from "./type";
import { router_shell } from "./shell";
import { resolve_replaced } from "../apps/replaces";

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
    window.addEventListener("hashchange", this.on_hash_change);
    // The Restore answer comes first, so a link opens on top of the restored windows instead of under the dialog.
    this.dispose_wait = $effect.root(() => {
      $effect(() => {
        if (this.session_service.status !== SessionStatus.PENDING) untrack(this.consume);
      });
    });
  }

  destroy(): void {
    window.removeEventListener("hashchange", this.on_hash_change);
    this.dispose_wait?.();
  }

  public link_for(id: WindowId, kind: RouteKind = RouteKind.APP): string | null {
    const instance = this.windows_service.get(id);
    if (!instance) return null;

    return route_url({ kind, id: instance.app.id, props: shareable_props(instance.app.props).props });
  }

  public async copy_link(id: WindowId, kind: RouteKind = RouteKind.APP): Promise<void> {
    const link = this.link_for(id, kind);
    if (!link) return;

    try {
      await this.clipboard_service.copy_text(link);
      const dropped = shareable_props(this.windows_service.get(id)?.app.props).dropped;
      this.notifications_service.notify("router", { type: "info", title: `${kind === RouteKind.SOLO ? "Solo link" : "Link"} copied${dropped ? " · the open file isn't included" : ""}`, message: link });
    } catch (error) {
      console.error("[RouterService] Copy failed:", error);
      this.notifications_service.notify("router", { type: "error", title: "Couldn't copy the link" });
    }
  }

  // Services are picked for the mode at boot, so a link into the other mode (or a new solo link) needs a fresh boot.
  private on_hash_change = (): void => {
    if (this.kernel.mode === Mode.SOLO || detect_mode() === Mode.SOLO) location.reload();
    else this.consume();
  };

  private consume = (): void => {
    if (this.session_service.status === SessionStatus.PENDING) return;

    const hash = location.hash;
    if (!hash.startsWith("#/")) return;
    // Consumed: a reload must not open the app a second time next to the restored session. A solo link stays, so a
    // reload reopens its app.
    if (this.kernel.mode === Mode.FULL) history.replaceState(history.state, "", `${location.pathname}${location.search}`);

    const route = parse_hash(hash);
    if (!route) {
      this.last_link = { hash, outcome: LinkOutcome.NOT_A_LINK };
      this.notifications_service.notify("router", { type: "error", title: "This link isn't one WebOS knows" });
      return;
    }
    void this.open(route).then((outcome) => (this.last_link = { hash, outcome }));
  };

  private async open(link: Route): Promise<LinkOutcome> {
    // Boot knows only the installed apps (ADR-077); a link to any other needs the full catalogue.
    if (!this.apps_service.get(link.id)) await this.apps_service.catalogue();
    const replaced = this.apps_service.get(link.id) ? null : resolve_replaced(Array.from(this.apps_service.list(), ([, manifest]) => manifest), link.id, link.props);
    const route = replaced ? { ...link, ...replaced } : link;
    const manifest = this.apps_service.get(route.id);
    if (!manifest) {
      this.notifications_service.notify("router", { type: "error", title: "The link points to an app that doesn't exist", message: route.id });
      return LinkOutcome.UNKNOWN_APP;
    }

    // launch() would open the app without its data; a link with bad data opens nothing.
    // Code that can't load (offline) opens anyway: the window says why.
    const code = route.props === undefined ? undefined : await this.apps_service.load(route.id).catch(() => undefined);
    if (code && !code.props?.safeParse(route.props).success) {
      this.notifications_service.notify("router", { type: "error", title: `The link to ${manifest.name} is broken`, message: "Its data doesn't fit the app." });
      return LinkOutcome.INVALID_PROPS;
    }

    this.apps_service.launch(route.id, route.props);
    return LinkOutcome.OPENED;
  }
}
