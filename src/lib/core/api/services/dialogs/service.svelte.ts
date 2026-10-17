import { v4 as uuid } from "uuid";
import type { Component } from "svelte";
import type { ExtractService, Kernel, WindowId, WindowsService } from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import type { DialogEntry, DialogOptions, DialogProps, DialogsService as IDialogsService, MenuItem } from "./type";
import ContextMenu from "$lib/core/components/dialogs/context-menu.svelte";
import { CloseChoice } from "../windows/close-guard";

export class DialogsService implements IDialogsService {
  name = "DialogsService";
  description = "System dialogs above windows";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `DialogsService: ${this.stack.length} open`;
  }

  public stack = $state.raw<DialogEntry[]>([]);
  public system = $derived(this.stack.filter((entry) => entry.window === null && entry.origin === null));

  private windows_service!: WindowsService;
  private dispose_watch?: () => void;
  private dispose_prompt?: () => void;

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
  }

  init() {
    // Windows asks before closing a window with unsaved changes; the sheet is ours (ADR-029).
    this.dispose_prompt = this.windows_service.set_close_prompt(
      async ({ id, title, can_save }) =>
        (await this.show(
          (await import("$lib/core/components/dialogs/save-changes-dialog.svelte")).default,
          { title, can_save },
          { window: id, dismissible: false }
        )) ?? CloseChoice.CANCEL
    );

    // A closed window takes its sheets with it: they resolve null like a cancel.
    this.dispose_watch = $effect.root(() => {
      $effect(() => {
        const open = new Set(this.windows_service.list());
        for (const entry of this.stack.filter((item) => item.window !== null && !open.has(item.window))) {
          entry.resolve(null);
        }
        // Their document is gone when the window comes back.
        const out = this.extract()?.current ?? null;
        for (const entry of this.stack.filter((item) => item.origin !== null && item.origin !== out)) {
          entry.resolve(null);
        }
      });
    });
  }

  destroy() {
    this.dispose_watch?.();
    this.dispose_prompt?.();
    for (const entry of [...this.stack].reverse()) {
      entry.resolve(null);
    }
  }

  public menu(items: MenuItem[], options: { anchor: Position }): Promise<string | null> {
    return this.show(ContextMenu, { items }, { anchor: options.anchor });
  }

  public for_window(window: WindowId): DialogEntry[] {
    return this.stack.filter((entry) => entry.window === window);
  }

  public for_origin(origin: WindowId): DialogEntry[] {
    return this.stack.filter((entry) => entry.window === null && entry.origin === origin);
  }

  /** Desktop only, and it depends on windows, which we depend on: looked up when needed, never at init. */
  private extract(): ExtractService | undefined {
    return this.kernel.services.get("extract") as ExtractService | undefined;
  }

  /** The popped-out window, when the last click or key press happened in there. */
  private origin(): WindowId | null {
    const extract = this.extract();
    return extract?.input_inside ? extract.current : null;
  }

  public show<T, P extends object>(
    component: Component<P & DialogProps<T>>,
    props: P,
    options: DialogOptions = {}
  ): Promise<T | null> {
    return new Promise((settle) => {
      const id = uuid();
      const origin = options.window ? null : this.origin();
      const entry: DialogEntry = {
        id,
        component: component as unknown as Component<DialogProps<unknown>>,
        props,
        point: options.anchor ?? this.fallback_point(origin),
        anchored: options.anchor !== undefined,
        dismissible: options.dismissible ?? true,
        window: options.window ?? null,
        origin,
        resolve: (value) => {
          if (!this.stack.some((item) => item.id === id)) return;
          this.stack = this.stack.filter((item) => item.id !== id);
          settle(value as T | null);
        },
      };
      this.stack = [...this.stack, entry];
      // A question in a background window brings that window forward, so it's never answered blind.
      if (entry.window) this.windows_service.focus(entry.window);
    });
  }

  private fallback_point(origin: WindowId | null): Position {
    const view = origin ? this.extract()?.document?.defaultView : null;
    if (view) return { x: view.innerWidth / 2, y: view.innerHeight / 2 };
    const focused = this.windows_service.get_focused();
    const element = focused ? document.querySelector(`[data-window-id="${focused}"]`) : null;
    const rect = element?.getBoundingClientRect() ?? this.windows_service.container.element?.getBoundingClientRect();
    if (!rect) return { x: innerWidth / 2, y: innerHeight / 2 };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
}
