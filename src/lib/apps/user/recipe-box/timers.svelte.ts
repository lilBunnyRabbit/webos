import kernel, { type NotificationsService } from "$lib/core/api";
import { play_chime } from "$lib/apps/user/clock/chime";
import { Timer as TimerIcon } from "phosphor-svelte";
import { APP_ID } from "./constants";

export interface RunningTimer {
  id: number;
  label: string;
  duration_ms: number;
  end_at: number;
}

// Owned by the window, not cook mode: a timer keeps running while you check the table or edit the recipe.
export class CookTimers {
  list = $state<RunningTimer[]>([]);
  now = $state(Date.now());
  private next_id = 1;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly recipe: () => string) {}

  start(label: string, duration_ms: number): void {
    this.list.push({ id: this.next_id++, label, duration_ms, end_at: Date.now() + duration_ms });
    this.now = Date.now();
    this.interval ??= setInterval(() => this.tick(), 250);
  }

  cancel(id: number): void {
    this.list = this.list.filter((timer) => timer.id !== id);
    if (this.list.length === 0) this.stop();
  }

  remaining(timer: RunningTimer): number {
    return Math.max(0, timer.end_at - this.now);
  }

  destroy(): void {
    this.stop();
    this.list = [];
  }

  private tick(): void {
    this.now = Date.now();
    const due = this.list.filter((timer) => timer.end_at <= this.now);
    if (due.length === 0) return;
    this.list = this.list.filter((timer) => timer.end_at > this.now);
    if (this.list.length === 0) this.stop();
    for (const timer of due) this.ring(timer);
  }

  private ring(timer: RunningTimer): void {
    play_chime();
    kernel.service<NotificationsService>("notifications").notify(APP_ID, {
      title: `${timer.label} is done`,
      message: this.recipe(),
      icon: TimerIcon,
      system: true,
      duration: null,
      actions: [{ label: "Stop", on_click: () => {} }],
    });
  }

  private stop(): void {
    if (this.interval !== null) clearInterval(this.interval);
    this.interval = null;
  }
}

export function format_countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
