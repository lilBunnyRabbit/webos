import type { FilesService } from "$lib/core/api";
import { LatestWriter } from "$lib/core/api/services/files/latest-writer";
import { DODGE_PATH, advance, parse_record, serialize_record, type DodgeStep } from "./dodge";

const SAVE_DELAY = 500;
const SHOWN_STEP = 100;

const shown = (ms: number) => Math.floor(ms / SHOWN_STEP) * SHOWN_STEP;

export class DodgeGame {
  /** Rounded to the tenth the HUD shows, so the DOM changes ten times a second, not every frame. */
  public current = $state(0);
  public best = $state(0);

  private elapsed = 0;
  private best_ms = 0;
  private saved_ms = 0;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private readonly writer: LatestWriter;

  constructor(private readonly files: () => FilesService) {
    this.writer = new LatestWriter(files, DODGE_PATH, "Pew Pew best time", { delay: SAVE_DELAY });
  }

  public load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  public step(step: DodgeStep): void {
    const before = this.elapsed;
    this.elapsed = advance(before, step);
    if (this.elapsed > this.best_ms) this.best_ms = this.elapsed;
    // Mid-run the best is saved once a second; a run's end (hit or pause) saves it exact.
    if (this.elapsed < before || !step.running || Math.floor(this.best_ms / 1000) > Math.floor(this.saved_ms / 1000)) this.save();
    this.show();
  }

  public pause(): void {
    this.step({ dt_ms: 0, running: false, hits: 0 });
  }

  public stop(): void {
    this.pause();
    this.elapsed = 0;
    this.show();
    this.writer.flush();
  }

  private async read(): Promise<void> {
    try {
      const text = (await (await this.files().get_file(DODGE_PATH))?.text()) ?? null;
      this.writer.seed(text);
      const record = parse_record(text);
      if (record) this.saved_ms = record.best_ms;
      if (record && record.best_ms > this.best_ms) this.best_ms = record.best_ms;
    } catch (error) {
      console.error("[Pew Pew] Failed to read the best time", error);
    }
    this.loaded = true;
    this.save();
    this.show();
  }

  // Until the file is read a run can't know whether it beat the saved best, so nothing is written before.
  private save(): void {
    if (!this.loaded || this.best_ms <= this.saved_ms) return;
    this.saved_ms = this.best_ms;
    this.writer.write(serialize_record({ best_ms: this.best_ms, at: Date.now() }));
  }

  private show(): void {
    this.current = shown(this.elapsed);
    this.best = shown(this.best_ms);
  }
}
