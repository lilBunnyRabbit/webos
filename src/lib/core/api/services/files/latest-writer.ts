import type { FilesService } from "./type";
import { split_path } from "./path";

/**
 * Writes a text file through FilesService for state that changes often (settings, session). Writes never overlap and
 * only the newest pending text lands; missing parent folders are created.
 */
export class LatestWriter {
  private queued: string | null = null;
  private writing = false;
  private waiting: Array<() => void> = [];

  constructor(
    private readonly files: () => FilesService,
    private readonly path: string,
    private readonly label: string
  ) {}

  /** A write is queued or on its way to disk. */
  get busy(): boolean {
    return this.writing || this.queued !== null;
  }

  /** Resolves once nothing is queued or being written. */
  idle(): Promise<void> {
    if (!this.busy) return Promise.resolve();
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  write(text: string): void {
    this.queued = text;
    if (!this.writing) void this.flush();
  }

  private async flush(): Promise<void> {
    this.writing = true;
    while (this.queued !== null) {
      const text = this.queued;
      this.queued = null;
      try {
        const segments = split_path(this.path);
        const directory = await this.ensure_directory(segments.slice(0, -1));
        await this.files().create_file(directory, segments.at(-1)!, { content: text, overwrite: true });
      } catch (error) {
        console.error(`Failed to save ${this.label}:`, error);
      }
    }
    this.writing = false;
    for (const resolve of this.waiting.splice(0)) resolve();
  }

  private async ensure_directory(segments: string[]): Promise<FileSystemDirectoryHandle> {
    let directory = await this.files().get_root();
    for (const segment of segments) {
      directory = (await this.files().exists(directory, segment, "directory"))
        ? await directory.getDirectoryHandle(segment)
        : await this.files().create_directory(directory, segment);
    }
    return directory;
  }
}
