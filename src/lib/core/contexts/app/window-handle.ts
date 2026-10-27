import kernel, { WindowFlag, type DialogsService, type WindowId, type WindowsService } from "$lib/core/api";
import ConfirmDialog from "$lib/core/components/dialogs/confirm-dialog.svelte";
import PromptDialog from "$lib/core/components/dialogs/prompt-dialog.svelte";
import type { Bounds } from "$lib/core/utils/type";
import type { PickOptions, WindowHandle } from "./type";

const file_picker = async () => (await import("$lib/core/components/files/file-picker-dialog.svelte")).default;

const NO_BOUNDS: Readonly<Bounds> = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

// Reads the service on every access, so reactivity comes from the service's state and a swapped WindowsService just works.
export function create_window_handle(id: WindowId): WindowHandle {
  const windows = () => kernel.service<WindowsService>("windows");
  const has = (flag: WindowFlag) => windows().get(id)?.flags.has(flag) ?? false;
  const dialogs = () => kernel.service<DialogsService>("dialogs");

  return {
    id,
    get is_focused() {
      return windows().is_focused(id);
    },
    get is_maximized() {
      return has(WindowFlag.MAXIMIZED);
    },
    get is_minimized() {
      return has(WindowFlag.MINIMIZED);
    },
    get is_visible() {
      return windows().is_visible(id);
    },
    get bounds() {
      return windows().get(id)?.bounds ?? NO_BOUNDS;
    },

    focus() {
      windows().focus(id);
    },
    close() {
      void windows().close(id);
    },
    set_title(title) {
      windows().set_title(id, title);
    },
    set_dirty(dirty, options) {
      windows().set_dirty(id, dirty, options);
    },
    minimize() {
      if (!has(WindowFlag.MINIMIZED)) windows().toggle_minimize(id);
    },
    maximize() {
      if (has(WindowFlag.MINIMIZED)) windows().toggle_minimize(id);
      if (!has(WindowFlag.MAXIMIZED)) windows().toggle_maximize(id);
    },
    on_back(handler) {
      return windows().add_back_handler(id, handler);
    },
    restore() {
      if (has(WindowFlag.MINIMIZED)) windows().toggle_minimize(id);
      else if (has(WindowFlag.MAXIMIZED)) windows().toggle_maximize(id);
    },

    async confirm(message, options = {}) {
      // A confirm needs an explicit answer: no Esc, no outside click (ADR-025).
      const answer = await dialogs().show(ConfirmDialog, { message, ...options }, { window: id, dismissible: false, swipe_cancels: true });
      return answer === true;
    },
    prompt(message, options = {}) {
      return dialogs().show(PromptDialog, { message, ...options }, { window: id });
    },
    pick_file: (async (options: PickOptions & { title?: string; multiple?: boolean } = {}) => {
      const paths = await dialogs().show(await file_picker(), { kind: "file" as const, ...options }, { window: id });
      return options.multiple ? (paths ?? []) : (paths?.[0] ?? null);
    }) as WindowHandle["pick_file"],
    async pick_directory(options = {}) {
      const paths = await dialogs().show(await file_picker(), { kind: "directory" as const, ...options }, { window: id });
      return paths?.[0] ?? null;
    },
    async pick_save(options = {}) {
      const paths = await dialogs().show(await file_picker(), { kind: "save" as const, ...options }, { window: id });
      return paths?.[0] ?? null;
    },
    request: (async (key: string, input?: unknown) => {
      try {
        return await (await import("./app-sheet")).open_app_sheet(id, key, input);
      } catch (error) {
        console.warn(`[WindowHandle] ${key} failed, resolving null`, error);
        return null;
      }
    }) as WindowHandle["request"],
  };
}
