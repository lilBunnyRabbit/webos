import kernel, { type FilesService } from "$lib/core/api";
import { LatestWriter } from "$lib/core/api/services/files/latest-writer";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { untrack } from "svelte";
import type { ZodType } from "zod";

export interface JsonFile<T> {
  /** Reactive; deep changes are saved once `ready`. */
  value: T;
  /** False until the first read finished. Nothing is written before that. */
  readonly ready: boolean;
  /** Why the file on disk was ignored (invalid JSON or schema). The file is kept until the next change. */
  readonly error: string | null;
  /** Drops this holder. The last one stops watching. Idempotent. */
  release(): void;
}

/** The app data folder (ADR-035). */
export function app_data_path(app_id: string, name = ""): string {
  return join_path(["var", "lib", "apps", app_id, ...split_path(name)]);
}

// Our own writes bump the folder's revision too; texts written recently are recognized and not read back over newer edits.
const RECENT_WRITES = 8;

const cells = new Map<string, JsonFileCell<unknown>>();

const files = () => kernel.service<FilesService>("files");
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

class JsonFileCell<T> {
  value = $state() as T;
  ready = $state(false);
  error = $state<string | null>(null);
  refs = 0;

  private initial: T;
  private last = "";
  private written: string[] = [];
  private load_seq = 0;
  private writer: LatestWriter;
  private dispose_root: () => void;

  constructor(
    private readonly path: string,
    initial: T,
    private readonly schema: ZodType<T>
  ) {
    this.initial = structuredClone(initial);
    this.value = structuredClone(initial);
    this.last = serialize(initial);
    this.writer = new LatestWriter(files, path, path);
    const directory = join_path(split_path(path).slice(0, -1));

    this.dispose_root = $effect.root(() => {
      $effect(() => {
        files().revision(directory);
        untrack(() => void this.load());
      });
      $effect(() => {
        const text = serialize($state.snapshot(this.value));
        if (!this.ready || text === this.last) return;
        this.last = text;
        this.written = [...this.written.slice(-(RECENT_WRITES - 1)), text];
        this.writer.write(text);
      });
    });
  }

  private async load(): Promise<void> {
    const seq = ++this.load_seq;
    // Disk lags behind a write in flight: reading now would undo it. A sibling file's write in the same folder triggers this.
    if (this.writer.busy) {
      await this.writer.idle();
      if (seq !== this.load_seq) return;
    }
    let text: string | null;
    try {
      text = (await (await files().get_file(this.path))?.text()) ?? null;
    } catch (error) {
      console.error(`Failed to read ${this.path}:`, error);
      text = null;
    }
    if (seq !== this.load_seq) return;

    if (text !== null && (text === this.last || this.written.includes(text))) {
      this.error = null;
      this.ready = true;
      return;
    }

    if (text === null) {
      if (this.ready) this.adopt(structuredClone(this.initial));
    } else {
      try {
        const result = this.schema.safeParse(JSON.parse(text));
        if (result.success) {
          this.error = null;
          this.adopt(result.data);
        } else {
          this.error = `Invalid data in ${this.path}`;
        }
      } catch {
        this.error = `Invalid JSON in ${this.path}`;
      }
    }
    this.ready = true;
  }

  private adopt(value: T): void {
    this.last = serialize(value);
    this.value = value;
  }

  dispose(): void {
    // A change made right before the last holder lets go would otherwise die with the save effect.
    const text = serialize($state.snapshot(this.value));
    if (this.ready && text !== this.last) this.writer.write(text);
    this.dispose_root();
  }
}

/**
 * A reactive JSON file shared by everyone holding the same path (ADR-035). Reads once, re-reads when its folder's
 * revision changes, writes newest-wins through `LatestWriter`. Call `release()` when done; `storage.file()` does it
 * for components.
 */
export function json_file<T>(path: string, initial: T, schema: ZodType<T>): JsonFile<T> {
  const key = join_path(split_path(path));
  let cell = cells.get(key) as JsonFileCell<T> | undefined;
  if (!cell) {
    cell = new JsonFileCell(key, initial, schema);
    cells.set(key, cell as JsonFileCell<unknown>);
  }
  cell.refs++;

  const owned = cell;
  let released = false;
  return {
    get value() {
      return owned.value;
    },
    set value(value: T) {
      owned.value = value;
    },
    get ready() {
      return owned.ready;
    },
    get error() {
      return owned.error;
    },
    release() {
      if (released) return;
      released = true;
      if (--owned.refs > 0) return;
      owned.dispose();
      cells.delete(key);
    },
  };
}
