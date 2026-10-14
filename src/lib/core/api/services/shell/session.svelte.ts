import { PATHS } from "../files/hierarchy";
import { GroupListing, plan, run_stages, type Registry } from "./pipeline";
import { EntryStatus, ShellError, type Entry, type Run, type SavedEntry, type ShellSession, type Value } from "./type";

export interface SessionHost extends Registry {
  remember(line: string): void;
  /** `sudo` asks once per line. */
  confirm_elevation(line: string): Promise<boolean>;
  /** A command as a value, for `win` listing its group. */
  describe(id: string): Value;
}

class EntryState implements Entry {
  status = $state<EntryStatus>(EntryStatus.RUNNING);
  /** Raw and replaced in batches: a deep proxy over thousands of streamed values costs more than it gives. */
  values = $state.raw<Value[]>([]);
  error = $state<string | null>(null);

  constructor(
    public readonly id: number,
    public readonly input: string,
    public readonly cwd: string
  ) {}
}

/** Streamed values land in batches, one render per frame instead of one per value. */
const FLUSH_MS = 16;

export class Session implements ShellSession {
  cwd = $state<string>(PATHS.home);
  entries = $state.raw<Entry[]>([]);

  private next_id = 1;

  constructor(
    private readonly host: SessionHost,
    cwd?: string
  ) {
    if (cwd) this.cwd = cwd;
  }

  run(input: string): Run {
    const entry = new EntryState(this.next_id++, input, this.cwd);
    this.entries = [...this.entries, entry];
    const controller = new AbortController();
    if (input.trim() !== "") this.host.remember(input);

    let pending: Value[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (pending.length === 0) return;
      entry.values = [...entry.values, ...pending];
      pending = [];
    };
    const emit = (value: Value) => {
      pending.push(value);
      timer ??= setTimeout(flush, FLUSH_MS);
    };

    const done = this.execute(input, controller.signal, emit).then(
      () => {
        entry.status = controller.signal.aborted ? EntryStatus.ABORTED : EntryStatus.DONE;
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          entry.status = EntryStatus.ABORTED;
          return;
        }
        entry.status = EntryStatus.FAILED;
        entry.error = message(error);
        if (!(error instanceof ShellError)) console.error("[ShellService]", error);
      }
    ).finally(flush);

    return { entry, abort: () => controller.abort(), done };
  }

  private async execute(input: string, signal: AbortSignal, emit: (value: Value) => void): Promise<void> {
    let stages;
    try {
      stages = plan(input, this.host);
    } catch (error) {
      if (!(error instanceof GroupListing)) throw error;
      for (const id of error.ids) emit(this.host.describe(id));
      return;
    }
    if (stages.some((stage) => stage.elevated) && !(await this.host.confirm_elevation(input))) {
      throw new ShellError("sudo: not confirmed");
    }
    await run_stages(stages, { session: this, signal, emit });
  }

  clear(): void {
    this.entries = [];
  }

  restore(saved: SavedEntry[]): void {
    this.entries = saved.map((item) => {
      const entry = new EntryState(this.next_id++, item.input, item.cwd);
      entry.status = item.status === EntryStatus.RUNNING ? EntryStatus.ABORTED : item.status;
      entry.values = item.text === "" ? [] : [item.text];
      entry.error = item.error;
      return entry;
    });
  }
}

function message(error: unknown): string {
  if (error instanceof ShellError) return error.message;
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
