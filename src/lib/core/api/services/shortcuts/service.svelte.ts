import type { AppsService, DialogsService, Kernel, UiService, WindowsService } from "$lib/core/api";
import { default_shortcuts } from "./defaults";
import { event_keys, has_command_modifier, is_mac, normalize } from "./keys";
import type { KeyShortcut, ShortcutsService as IShortcutsService } from "./type";

export class ShortcutsService implements IShortcutsService {
  name = "ShortcutsService";
  description = "Keyboard shortcuts: registry and one keydown dispatcher";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `ShortcutsService: ${this.shortcuts.length} shortcuts`;
  }

  public readonly mac = is_mac();

  /** Raw and replaced on change: a deep proxy would hand out copies, and the disposer must find its own entry. */
  private shortcuts = $state.raw<KeyShortcut[]>([]);

  private windows_service!: WindowsService;
  private dialogs_service!: DialogsService;
  private dispose_defaults: Array<() => void> = [];

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
  }

  init(): void {
    const services = {
      windows: () => this.windows_service,
      apps: () => this.kernel.service<AppsService>("apps"),
      dialogs: () => this.dialogs_service,
      ui: () => this.kernel.service<UiService>("ui"),
    };
    this.dispose_defaults = default_shortcuts(services).map((shortcut) => this.register(shortcut));
    window.addEventListener("keydown", this.on_keydown);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.on_keydown);
    for (const dispose of this.dispose_defaults) dispose();
  }

  public register(shortcut: KeyShortcut): () => void {
    const entry = { ...shortcut, keys: normalize(shortcut.keys) };
    const clash = this.shortcuts.find((other) => other.keys === entry.keys && other.window === entry.window);
    if (clash) console.warn(`[ShortcutsService] "${entry.id}" takes ${entry.keys} from "${clash.id}"`);

    this.shortcuts = [...this.shortcuts, entry];
    return () => {
      this.shortcuts = this.shortcuts.filter((shortcut) => shortcut !== entry);
    };
  }

  public list(): KeyShortcut[] {
    return this.shortcuts;
  }

  /** Arrow function: it's the listener itself. */
  private on_keydown = (event: KeyboardEvent) => {
    // Local handlers (a focused row, a menu) run first and claim their keys with preventDefault.
    if (event.defaultPrevented || event.isComposing) return;
    // A system dialog is modal: nothing behind it reacts to keys.
    if (this.dialogs_service.system.length > 0) return;

    const keys = event_keys(event, this.mac);
    if (!keys) return;
    if (is_editable(event.target) && !has_command_modifier(keys)) return;

    const focused = this.windows_service.get_focused();
    // Newest first, window scope ahead of global: the most specific, latest registration wins.
    const candidates = this.shortcuts.filter((shortcut) => shortcut.keys === keys).reverse();
    const match =
      candidates.find((shortcut) => focused !== null && shortcut.window === focused && (shortcut.when?.() ?? true)) ??
      candidates.find((shortcut) => shortcut.window === undefined && (shortcut.when?.() ?? true));
    if (!match) return;

    event.preventDefault();
    match.run();
  };
}

function is_editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}
