import type { DialogsService, FilesService, Kernel, NotificationsService } from "$lib/core/api";
import ConfirmDialog from "$lib/core/components/dialogs/confirm-dialog.svelte";
import { LatestWriter } from "../files/latest-writer";
import { command_value, core_shell } from "./commands";
import { complete } from "./complete";
import { Session } from "./session.svelte";
import { EntryStatus, type Command, type Completer, type CompletionResult, type Entry, type ShellContribution, type ShellService as IShellService, type ShellSession, type ValueType } from "./type";
import { plan } from "./pipeline";

export const HISTORY_PATH = "/var/lib/shell/history";
const HISTORY_CAP = 1000;

export class ShellService implements IShellService {
  name = "ShellService";
  description = "Commands contributed by services, run by the terminal, the palette and shortcuts";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `ShellService: ${this.commands.length} commands, ${this.history.length} in history`;
  }

  public history = $state.raw<string[]>([]);

  /** Read from every initialised service, so one that starts after the shell still contributes (ADR-033). */
  private contributions = $derived.by(() => {
    const list: { key: string; contribution: ShellContribution }[] = [];
    for (const [key, service] of this.kernel.services) {
      const contribution = service === this ? this.own : service.shell?.();
      if (contribution) list.push({ key, contribution });
    }
    // Before the kernel adds the shell to its services (and in tests that skip it), the core commands still exist.
    if (![...this.kernel.services.values()].includes(this)) list.push({ key: "shell", contribution: this.own });
    return list;
  });

  private registry = $derived.by(() => {
    const commands = new Map<string, Command>();
    const completers = new Map<string, Completer>();
    const parts = new Map<string, Partial<ValueType>>();
    for (const { key, contribution } of this.contributions) {
      for (const command of contribution.commands ?? []) {
        if (command.app) continue;
        if (commands.has(command.id)) console.warn(`[ShellService] "${command.id}" from ${key} replaces an earlier one`);
        commands.set(command.id, command);
      }
      for (const [kind, completer] of Object.entries(contribution.completers ?? {})) completers.set(kind, completer);
      for (const [type, value] of Object.entries(contribution.values ?? {})) parts.set(type, { ...parts.get(type), ...value });
    }
    for (const { contribution } of this.contributions) {
      for (const command of contribution.commands ?? []) {
        if (!command.app) continue;
        const taken = commands.get(command.id);
        if (taken && !taken.app) {
          console.warn(`[ShellService] "${command.id}" from app ${command.app} ignored, a service owns it`);
          continue;
        }
        if (taken) console.warn(`[ShellService] "${command.id}" from app ${command.app} replaces app ${taken.app}'s`);
        commands.set(command.id, command);
      }
    }
    const values = new Map<string, ValueType>();
    for (const [type, value] of parts) {
      if (value.columns && value.text) values.set(type, value as ValueType);
    }
    return { commands, completers, values };
  });

  public commands = $derived([...this.registry.commands.values()].sort((a, b) => a.id.localeCompare(b.id)));

  private own: ShellContribution;
  private writer: LatestWriter;
  private files_service!: FilesService;
  private dialogs_service!: DialogsService;
  private notifications_service!: NotificationsService;

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.writer = new LatestWriter(() => this.files_service, HISTORY_PATH, "shell history");
    this.own = core_shell({
      find: (id) => this.find(id),
      commands: () => this.commands,
      history: () => this.history,
      kernel: this.kernel,
    });
  }

  async init(): Promise<void> {
    try {
      const file = await this.files_service.get_file(HISTORY_PATH);
      if (file) this.history = (await file.text()).split("\n").filter(Boolean).slice(-HISTORY_CAP);
    } catch (error) {
      console.error("[ShellService] Failed to read history", error);
    }
  }

  shell(): ShellContribution {
    return this.own;
  }

  public find(id: string): Command | undefined {
    return this.registry.commands.get(id);
  }

  public value_type(type: string): ValueType | undefined {
    return this.registry.values.get(type);
  }

  public completer(kind: string): Completer | undefined {
    return this.registry.completers.get(kind);
  }

  public remember(line: string): void {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.includes("\n") || this.history.at(-1) === trimmed) return;
    this.history = [...this.history, trimmed].slice(-HISTORY_CAP);
    this.writer.write(this.history.join("\n") + "\n");
  }

  public session(cwd?: string): ShellSession {
    return this.create_session(cwd, true);
  }

  /** Shortcut and palette runs aren't typed lines, so they stay out of the history. */
  private create_session(cwd: string | undefined, record: boolean): Session {
    return new Session(
      {
        find: (id) => this.find(id),
        ids: () => [...this.registry.commands.keys()],
        remember: (line) => record && this.remember(line),
        confirm_elevation: (line) => this.confirm_elevation(line),
        describe: (id) => command_value(this.find(id)!),
      },
      cwd
    );
  }

  public complete(input: string, cursor: number, session: ShellSession): Promise<CompletionResult> {
    return complete(input, cursor, session, {
      find: (id) => this.find(id),
      ids: () => [...this.registry.commands.keys()],
      completer: (kind) => this.completer(kind),
      value_type: (type) => this.value_type(type),
    });
  }

  public available(line: string): boolean {
    try {
      return plan(line, { find: (id) => this.find(id), ids: () => [...this.registry.commands.keys()] }).length > 0;
    } catch {
      return false;
    }
  }

  public async execute(line: string): Promise<Entry> {
    const run = this.create_session(undefined, false).run(line);
    await run.done;
    if (run.entry.status === EntryStatus.FAILED) {
      this.notifications_service.notify("shell", { type: "error", title: run.entry.error ?? "Command failed", message: line });
    }
    return run.entry;
  }

  private async confirm_elevation(line: string): Promise<boolean> {
    const answer = await this.dialogs_service.show(
      ConfirmDialog,
      { message: "Change system files?", detail: line, confirm_label: "Run", danger: true },
      { dismissible: false }
    );
    return answer === true;
  }
}
