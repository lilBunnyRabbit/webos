import { untrack } from "svelte";
import { LatestWriter } from "../files/latest-writer";
import type { FilesService } from "../files/type";
import type { WindowsService } from "../windows/type";
import {
  add_delta,
  add_time,
  merge_usage,
  parse_usage,
  serialize_usage,
  stretch_seconds,
  USAGE_PATH,
  type AppUsage,
  type Usage,
  type UsageDelta,
} from "./active-time";
import type { AppId } from "./type";

const COMMIT_EVERY = 60_000;
const MAX_STRETCH = 2 * COMMIT_EVERY;
const WRITE_DELAY = 2_000;

export class ActiveTime {
  private usage: Usage = $state.raw({});
  private visible = $state(document.visibilityState === "visible");
  private current: { id: AppId; since: number } | null = null;
  /** Counted here since the last write; each write adds it onto the file as it is then, so tabs don't overwrite each other. */
  private deltas: Record<AppId, UsageDelta> = {};
  private readonly writer: LatestWriter;
  private tick: ReturnType<typeof setInterval> | null = null;
  private save_timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private cleanups: (() => void)[] = [];
  private stopped = false;
  // Until the file is read, `get()` can't tell an app never used from one not read yet.
  public loaded = false;

  constructor(
    private readonly files: () => FilesService,
    private readonly windows: () => WindowsService
  ) {
    this.writer = new LatestWriter(files, USAGE_PATH, "app usage");
  }

  get(id: AppId): AppUsage | null {
    return this.usage[id] ?? null;
  }

  async start(): Promise<void> {
    const text = await this.read();
    if (this.stopped) return;
    this.writer.seed(text);
    this.usage = merge_usage(parse_usage(text), this.deltas);
    this.loaded = true;

    const on_visibility = () => {
      this.visible = document.visibilityState === "visible";
      if (this.visible) return;
      this.follow(null);
      this.save();
    };
    document.addEventListener("visibilitychange", on_visibility);
    this.cleanups.push(
      () => document.removeEventListener("visibilitychange", on_visibility),
      () => this.stop_tick(),
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
    this.save();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  private follow(id: AppId | null): void {
    const now = Date.now();
    if (this.current) {
      const seconds = stretch_seconds(this.current.since, now, MAX_STRETCH);
      if (seconds > 0) {
        this.usage = add_time(this.usage, this.current.id, seconds, new Date(now));
        this.deltas = add_delta(this.deltas, this.current.id, seconds, new Date(now));
        this.save_timer ??= setTimeout(() => this.save(), WRITE_DELAY);
      }
    }
    this.current = id ? { id, since: now } : null;
    // Only while a stretch runs: an idle tab never wakes up for it.
    if (this.current) this.tick ??= setInterval(() => this.follow(this.current?.id ?? null), COMMIT_EVERY);
    else this.stop_tick();
  }

  private stop_tick(): void {
    if (this.tick !== null) clearInterval(this.tick);
    this.tick = null;
  }

  private save(): void {
    if (this.save_timer !== null) clearTimeout(this.save_timer);
    this.save_timer = null;
    this.saving = this.saving.then(async () => {
      const deltas = this.deltas;
      if (Object.keys(deltas).length === 0) return;
      this.deltas = {};
      try {
        const merged = merge_usage(parse_usage(await this.read()), deltas);
        this.writer.write(serialize_usage(merged));
        this.usage = merge_usage(merged, this.deltas);
      } catch (error) {
        console.warn("[AppsService] Couldn't save app usage", error);
        for (const [id, delta] of Object.entries(deltas)) this.deltas = add_delta(this.deltas, id, delta.seconds, new Date(delta.last));
      }
    });
  }

  private async read(): Promise<string | null> {
    const file = await this.files().get_file(USAGE_PATH);
    return file ? file.text() : null;
  }
}
