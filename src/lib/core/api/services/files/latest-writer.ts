import type { FilesService } from "./type";
import { split_path } from "./path";

export interface LatestWriterOptions {
  delay?: number;
}

const pending = new Set<LatestWriter>();
let listening = false;

function flush_pending(): void {
  for (const writer of pending) writer.flush();
}

function listen(): void {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush_pending();
  });
  // Capture runs before main.ts's pagehide listener, which shuts the kernel down and with it kernel.service("files").
  window.addEventListener("pagehide", flush_pending, { capture: true });
}

// Backup reads and restore holds writes: a delayed save must land first.
export function flush_writers(): Promise<void> {
  return Promise.all([...pending].map((writer) => writer.idle())).then(() => {});
}

const is_not_found = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

/**
 * Writes a text file through FilesService for state that changes often (settings, session). Writes never overlap and
 * only the newest pending text lands; missing parent folders are created. With a `delay`, a burst of writes saves once.
 */
export class LatestWriter {
  private queued: string | null = null;
  private written: string | null = null;
  private writing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiting: Array<() => void> = [];
  private directory: FileSystemDirectoryHandle | null = null;
  private readonly delay: number;

  constructor(
    private readonly files: () => FilesService,
    private readonly path: string,
    private readonly label: string,
    options: LatestWriterOptions = {}
  ) {
    this.delay = options.delay ?? 0;
  }

  /** A write is waiting for its delay, queued, or on its way to disk. */
  get busy(): boolean {
    return this.writing || this.queued !== null;
  }

  /** Saves a delayed write now and resolves once nothing is queued or being written. */
  idle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    const done = new Promise<void>((resolve) => this.waiting.push(resolve));
    this.flush();
    return done;
  }

  /** The text the file already holds (read at init), so writing the same text again is skipped. */
  seed(text: string | null): void {
    this.written = text;
  }

  write(text: string): void {
    this.queued = text;
    if (this.delay <= 0) return this.flush();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
    pending.add(this);
    listen();
  }

  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    pending.delete(this);
    if (!this.writing) void this.run();
  }

  private async run(): Promise<void> {
    this.writing = true;
    // A write() during a save restarts the delay; that text waits for its timer.
    while (this.queued !== null && this.timer === null) {
      const text = this.queued;
      this.queued = null;
      if (text === this.written) continue;
      try {
        await this.save(text);
        this.written = text;
      } catch (error) {
        console.error(`Failed to save ${this.label}:`, error);
      }
    }
    this.writing = false;
    if (!this.busy) for (const resolve of this.waiting.splice(0)) resolve();
  }

  private async save(text: string): Promise<void> {
    // Resolved once, synchronously: a flush on pagehide outlives the kernel's shutdown.
    const files = this.files();
    const segments = split_path(this.path);
    const name = segments.at(-1)!;
    try {
      this.directory ??= await this.ensure_directory(files, segments.slice(0, -1));
      await files.create_file(this.directory, name, { content: text, overwrite: true });
    } catch (error) {
      this.directory = null;
      // The cached folder was removed (backup restore, clear()): walk the path again once.
      if (!is_not_found(error)) throw error;
      this.directory = await this.ensure_directory(files, segments.slice(0, -1));
      await files.create_file(this.directory, name, { content: text, overwrite: true });
    }
  }

  private async ensure_directory(files: FilesService, segments: string[]): Promise<FileSystemDirectoryHandle> {
    let directory = await files.get_root();
    for (const segment of segments) {
      try {
        directory = await directory.getDirectoryHandle(segment);
      } catch (error) {
        if (!is_not_found(error)) throw error;
        // Through FilesService, so creating the folder bumps its revision.
        directory = await files.create_directory(directory, segment);
      }
    }
    return directory;
  }
}
