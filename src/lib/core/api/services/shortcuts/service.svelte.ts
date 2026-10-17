import { untrack } from "svelte";
import type { DialogsService, Kernel, ShellService, WindowsService } from "$lib/core/api";
import { DEFAULT_SHORTCUTS } from "./defaults";
import { event_keys, has_command_modifier, is_mac, normalize } from "./keys";
import { shortcuts_shell } from "./shell";
import type { KeyShortcut, ListedShortcut, ShortcutsService as IShortcutsService } from "./type";

export class ShortcutsService implements IShortcutsService {
  name = "ShortcutsService";
  description = "Keyboard shortcuts: registry and one keydown dispatcher";
  inspector = () => import("./inspector.svelte");
  shell = () => shortcuts_shell(this, () => this.dialogs_service);

  to_string(): string {
    return `ShortcutsService: ${this.shortcuts.length} shortcuts`;
  }

  public readonly mac = is_mac();

  /** Raw and replaced on change: a deep proxy would hand out copies, and the disposer must find its own entry. */
  private shortcuts = $state.raw<KeyShortcut[]>([]);
  private suspends = $state(0);

  public get suspended(): boolean {
    return this.suspends > 0;
  }

  private windows_service!: WindowsService;
  private dialogs_service!: DialogsService;
  private shell_service!: ShellService;
  private dispose_defaults: Array<() => void> = [];

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.shell_service = $derived(this.kernel.service<ShellService>("shell"));
  }

  init(): void {
    this.dispose_defaults = DEFAULT_SHORTCUTS.map((shortcut) => this.register(shortcut));
    window.addEventListener("keydown", this.on_keydown);
  }

  destroy(): void {
    window.removeEventListener("keydown", this.on_keydown);
    for (const dispose of this.dispose_defaults) dispose();
  }

  /**
   * Untracked: apps register from `$effect`, and an effect that read `shortcuts` while writing it would re-run
   * (dispose, register) forever.
   */
  public register(shortcut: KeyShortcut): () => void {
    const entry = { ...shortcut, keys: normalize(shortcut.keys) };
    untrack(() => {
      const clash = this.shortcuts.find((other) => other.keys === entry.keys && scope(other) === scope(entry));
      if (clash) console.warn(`[ShortcutsService] "${entry.id}" takes ${entry.keys} from "${clash.id}"`);
      this.shortcuts = [...this.shortcuts, entry];
    });
    return () =>
      untrack(() => {
        this.shortcuts = this.shortcuts.filter((shortcut) => shortcut !== entry);
      });
  }

  /** Untracked for the same reason as `register`: callers suspend from `$effect`. */
  public suspend(): () => void {
    untrack(() => this.suspends++);
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      untrack(() => this.suspends--);
    };
  }

  public list(): ListedShortcut[] {
    const listed: ListedShortcut[] = [];
    for (const shortcut of this.shortcuts) {
      if (!("command" in shortcut)) {
        listed.push(shortcut);
        continue;
      }
      const words = shortcut.command.split(" ");
      const command = words.map((_, index) => this.shell_service.find(words.slice(0, words.length - index).join(" "))).find(Boolean);
      if (command) listed.push({ ...shortcut, label: shortcut.label ?? command.description });
    }
    return listed;
  }

  private live(shortcut: KeyShortcut): boolean {
    if ("command" in shortcut) return this.shell_service.available(shortcut.command);
    return shortcut.when?.() ?? true;
  }

  /** Arrow function: it's the listener itself. */
  private on_keydown = (event: KeyboardEvent) => {
    // Local handlers (a focused row, a menu) run first and claim their keys with preventDefault.
    if (event.defaultPrevented || event.isComposing || this.suspends > 0) return;
    // A system dialog is modal: nothing behind it reacts to keys.
    if (this.dialogs_service.system.length > 0) return;

    const keys = event_keys(event, this.mac);
    if (!keys) return;
    if (is_editable(event.target) && !has_command_modifier(keys)) return;

    const focused = this.windows_service.get_focused();
    // Newest first, window scope ahead of global: the most specific, latest registration wins.
    const candidates = this.shortcuts.filter((shortcut) => shortcut.keys === keys).reverse();
    const match =
      candidates.find((shortcut) => focused !== null && scope(shortcut) === focused && this.live(shortcut)) ??
      candidates.find((shortcut) => scope(shortcut) === undefined && this.live(shortcut));
    if (!match) return;

    event.preventDefault();
    if ("command" in match) void this.shell_service.execute(match.command);
    else match.run();
  };
}

function scope(shortcut: KeyShortcut) {
  return "window" in shortcut ? shortcut.window : undefined;
}

function is_editable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches("input, textarea, select");
}
