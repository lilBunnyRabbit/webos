import type { DialogsService, Kernel, NotificationsService, WindowId, WindowsService } from "$lib/core/api";
import ConfirmDialog from "$lib/core/components/dialogs/confirm-dialog.svelte";
import { short_id } from "../windows/shell";
import { extract_shell } from "./shell";
import type { ExtractService as IExtractService } from "./type";

const STYLESHEETS = 'style, link[rel="stylesheet"]';

export class ExtractService implements IExtractService {
  name = "ExtractService";
  description = "Pops one window out into an always-on-top mini window";
  inspector = () => import("./inspector.svelte");
  shell = () => extract_shell(this, this.windows_service);

  to_string(): string {
    return `ExtractService: ${this.current ? `${short_id(this.current)} out` : "nothing out"}`;
  }

  public readonly supported = typeof documentPictureInPicture !== "undefined";
  public current = $state<WindowId | null>(null);
  public document = $state.raw<Document | null>(null);
  public input_inside = false;

  private pip: Window | null = null;
  private observers: MutationObserver[] = [];
  private windows_service!: WindowsService;
  private dialogs_service!: DialogsService;
  private notifications_service!: NotificationsService;
  private dispose_watch?: () => void;

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
  }

  private on_tab_input = () => {
    this.input_inside = false;
  };

  init() {
    window.addEventListener("pointerdown", this.on_tab_input, true);
    window.addEventListener("keydown", this.on_tab_input, true);
    // A closed window takes its mini window with it.
    this.dispose_watch = $effect.root(() => {
      $effect(() => {
        if (this.current && !this.windows_service.exists(this.current)) this.close();
      });
    });
  }

  destroy() {
    this.dispose_watch?.();
    window.removeEventListener("pointerdown", this.on_tab_input, true);
    window.removeEventListener("keydown", this.on_tab_input, true);
    this.close();
  }

  public can_pop(id: WindowId): boolean {
    const instance = this.windows_service.get(id);
    return this.supported && instance !== null && !instance.dirty;
  }

  public async pop(id: WindowId): Promise<boolean> {
    if (this.current === id) {
      this.focus();
      return true;
    }
    if (!this.can_pop(id)) return false;
    // Asking spends the click's user activation, so the new mini window can't open in the same click.
    const out = this.current ? this.windows_service.get(this.current) : null;
    if (out?.dirty) {
      if (await this.bring_back()) {
        this.notifications_service.notify("extract", {
          type: "info",
          title: `${out.title ?? out.app.manifest.name} is back`,
          message: "Pop out again to open the other window.",
        });
      }
      return false;
    }
    const { bounds } = this.windows_service.get(id)!;
    let pip: Window;
    try {
      pip = await documentPictureInPicture!.requestWindow({ width: Math.round(bounds.width), height: Math.round(bounds.height) });
    } catch (error) {
      console.error("[ExtractService] Picture-in-Picture refused", error);
      return false;
    }
    // Chrome closes the first one itself, but not every build does; its pagehide sees it's no longer ours.
    const previous = this.pip;
    this.release();
    previous?.close();
    this.pip = pip;
    this.mirror(pip.document);
    const on_input = () => {
      if (this.pip === pip) this.input_inside = true;
    };
    pip.addEventListener("pointerdown", on_input, true);
    pip.addEventListener("keydown", on_input, true);
    pip.addEventListener("pagehide", () => {
      if (this.pip === pip) this.release();
    });
    this.current = id;
    this.document = pip.document;
    return true;
  }

  public async bring_back(): Promise<boolean> {
    const instance = this.current ? this.windows_service.get(this.current) : null;
    if (instance?.dirty && !(await this.confirm_discard(instance.id, instance.title ?? instance.app.manifest.name))) return false;
    this.close();
    return true;
  }

  /** The `confirm_discard` question, as a sheet: it shows in the mini window, where the work is. */
  private async confirm_discard(id: WindowId, name: string): Promise<boolean> {
    const answer = await this.dialogs_service.show(
      ConfirmDialog,
      { message: `Discard changes to “${name}”?`, detail: "Your unsaved changes will be lost.", confirm_label: "Discard", danger: true },
      { window: id }
    );
    return answer === true;
  }

  private close() {
    const pip = this.pip;
    this.release();
    pip?.close();
  }

  public focus(): void {
    this.pip?.focus();
  }

  private release() {
    for (const observer of this.observers) observer.disconnect();
    this.observers = [];
    this.pip = null;
    this.input_inside = false;
    this.current = null;
    this.document = null;
  }

  /** Styles and the theme live on the tab's document: copied in once, then followed (lazy apps add stylesheets later). */
  private mirror(target: Document) {
    const copy_attributes = (from: Element, to: Element) => {
      for (const name of to.getAttributeNames()) if (!from.hasAttribute(name)) to.removeAttribute(name);
      for (const { name, value } of from.attributes) to.setAttribute(name, value);
    };
    copy_attributes(document.documentElement, target.documentElement);
    copy_attributes(document.body, target.body);
    for (const node of document.head.querySelectorAll(STYLESHEETS)) target.head.append(node.cloneNode(true));

    const theme = new MutationObserver(() => copy_attributes(document.documentElement, target.documentElement));
    theme.observe(document.documentElement, { attributes: true });
    const sheets = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && node.matches(STYLESHEETS)) target.head.append(node.cloneNode(true));
        }
      }
    });
    sheets.observe(document.head, { childList: true });
    this.observers = [theme, sheets];
  }
}
