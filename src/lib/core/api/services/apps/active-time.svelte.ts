import { untrack } from "svelte";
import { LatestWriter } from "../files/latest-writer";
import type { FilesService } from "../files/type";
import type { WindowsService } from "../windows/type";
import { add_time, parse_usage, serialize_usage, USAGE_PATH, type AppUsage, type Usage } from "./active-time";
import type { AppId } from "./type";

const COMMIT_EVERY = 60_000;
const WRITE_DELAY = 2_000;

export class ActiveTime {
  private usage: Usage = $state.raw({});
  private visible = $state(document.visibilityState === "visible");
  private current: { id: AppId; since: number } | null = null;
  private readonly writer: LatestWriter;
  private cleanups: (() => void)[] = [];
  private stopped = false;

  constructor(
    private readonly files: () => FilesService,
    private readonly windows: () => WindowsService
  ) {
    this.writer = new LatestWriter(files, USAGE_PATH, "app usage", { delay: WRITE_DELAY });
  }

  get(id: AppId): AppUsage | null {
    return this.usage[id] ?? null;
  }

  async start(): Promise<void> {
    const file = await this.files().get_file(USAGE_PATH);
    const text = file ? await file.text() : null;
    if (this.stopped) return;
    this.writer.seed(text);
    this.usage = { ...parse_usage(text), ...this.usage };

    // Synchronous on hide, so the stretch is saved by the writers' pagehide flush.
    const on_visibility = () => {
      this.visible = document.visibilityState === "visible";
      if (!this.visible) this.follow(null);
    };
    document.addEventListener("visibilitychange", on_visibility);
    const timer = setInterval(() => this.follow(this.current?.id ?? null), COMMIT_EVERY);
    this.cleanups.push(
      () => document.removeEventListener("visibilitychange", on_visibility),
      () => clearInterval(timer),
      $effect.root(() => {
        $effect(() => {
          const windows = this.windows();
          const focused = windows.get_focused();
          const id = this.visible && focused ? (windows.get(focused)?.app.id ?? null) : null;
          untrack(() => this.follow(id));
        });
      })
    );
  }

  destroy(): void {
    this.stopped = true;
    this.follow(null);
    this.writer.flush();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  private follow(id: AppId | null): void {
    const now = Date.now();
    if (this.current) {
      const seconds = (now - this.current.since) / 1000;
      this.usage = add_time(this.usage, this.current.id, seconds, new Date(now));
      if (seconds > 0) this.writer.write(serialize_usage(this.usage));
    }
    this.current = id ? { id, since: now } : null;
  }
}
