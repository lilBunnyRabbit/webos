import { v4 as uuid } from "uuid";
import type { Component } from "svelte";
import type { Kernel, WindowsService } from "$lib/core/api";
import type { Position } from "$lib/core/utils/type";
import type { DialogEntry, DialogOptions, DialogProps, DialogsService as IDialogsService } from "./type";

export class DialogsService implements IDialogsService {
  name = "DialogsService";
  description = "System dialogs above windows";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `DialogsService: ${this.stack.length} open`;
  }

  public stack = $state<DialogEntry[]>([]);

  private windows_service!: WindowsService;

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
  }

  destroy() {
    for (const entry of [...this.stack].reverse()) {
      entry.resolve(null);
    }
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
        resolve: (value) => {
          const index = this.stack.findIndex((item) => item.id === id);
          if (index === -1) return;
          this.stack.splice(index, 1);
          settle(value as T | null);
        },
      };
      this.stack.push(entry);
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
