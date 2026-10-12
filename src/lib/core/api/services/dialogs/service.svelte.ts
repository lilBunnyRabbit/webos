import { v4 as uuid } from "uuid";
import type { Component } from "svelte";
import type { Kernel, WindowId, WindowsService } from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import type { DialogEntry, DialogOptions, DialogProps, DialogsService as IDialogsService, MenuItem } from "./type";
import ContextMenu from "$lib/core/components/dialogs/context-menu.svelte";
import SaveChangesDialog from "$lib/core/components/dialogs/save-changes-dialog.svelte";
import { CloseChoice } from "../windows/close-guard";

export class DialogsService implements IDialogsService {
  name = "DialogsService";
  description = "System dialogs above windows";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `DialogsService: ${this.stack.length} open`;
  }

  public stack = $state<DialogEntry[]>([]);
  public system = $derived(this.stack.filter((entry) => entry.window === null));

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
        (await this.show(SaveChangesDialog, { title, can_save }, { window: id, dismissible: false })) ?? CloseChoice.CANCEL
    );

    // A closed window takes its sheets with it: they resolve null like a cancel.
    this.dispose_watch = $effect.root(() => {
      $effect(() => {
        const open = new Set(this.windows_service.list());
        for (const entry of this.stack.filter((item) => item.window !== null && !open.has(item.window))) {
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

  public show<T, P extends object>(
    component: Component<P & DialogProps<T>>,
    props: P,
    options: DialogOptions = {}
  ): Promise<T | null> {
    return new Promise((settle) => {
      const id = uuid();
      const entry: DialogEntry = {
        id,
        component: component as unknown as Component<DialogProps<unknown>>,
        props,
        point: options.anchor ?? this.fallback_point(),
        anchored: options.anchor !== undefined,
        dismissible: options.dismissible ?? true,
        window: options.window ?? null,
        resolve: (value) => {
          const index = this.stack.findIndex((item) => item.id === id);
          if (index === -1) return;
          this.stack.splice(index, 1);
          settle(value as T | null);
        },
      };
      this.stack.push(entry);
      // A question in a background window brings that window forward, so it's never answered blind.
      if (entry.window) this.windows_service.focus(entry.window);
    });
  }

  private fallback_point(): Position {
    const focused = this.windows_service.get_focused();
    const element = focused ? document.querySelector(`[data-window-id="${focused}"]`) : null;
    const rect = element?.getBoundingClientRect() ?? this.windows_service.container.element?.getBoundingClientRect();
    if (!rect) return { x: innerWidth / 2, y: innerHeight / 2 };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
}
