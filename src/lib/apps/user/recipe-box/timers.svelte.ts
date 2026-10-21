import kernel, { type JobId, type NotificationsService, type SchedulerService } from "$lib/core/api";
import { Ticker } from "$lib/core/utils/ticker.svelte";
import { APP_ID } from "./constants";
import { cook_timer_input, cook_timers, type CookTimer, type RecipeRef } from "./timers";
import { report_error } from "$kit/utils/report-error";

const scheduler = () => kernel.service<SchedulerService>("scheduler");

export function start_cook_timer(label: string, duration_ms: number, recipe: RecipeRef): Promise<unknown> {
  return scheduler().schedule(APP_ID, cook_timer_input(`timer-${crypto.randomUUID().slice(0, 8)}`, label, duration_ms, recipe, Date.now()));
}

/** The open recipe's timers. They live in the scheduler, so they outlast the window and show again when it reopens. */
export class CookTimers {
  private readonly scheduler = $derived(kernel.service<SchedulerService>("scheduler"));
  private readonly notifications = $derived(kernel.service<NotificationsService>("notifications"));
  private readonly ticker: Ticker;

  readonly list = $derived(cook_timers(this.scheduler.list(APP_ID)).filter((timer) => timer.path === this.recipe()?.path));

  constructor(
    private readonly recipe: () => RecipeRef | null,
    visible: () => boolean
  ) {
    this.ticker = new Ticker(visible, 250);
  }

  start(label: string, duration_ms: number): void {
    const recipe = this.recipe();
    if (!recipe) return;
    // In the click that starts it, so the browser counts the permission prompt as the user's.
    void this.notifications.request_system();
    start_cook_timer(label, duration_ms, recipe).catch((reason) => report_error(APP_ID, "Couldn't start the timer", reason));
  }

  cancel(id: JobId): void {
    this.scheduler.cancel(id).catch((reason) => report_error(APP_ID, "Couldn't stop the timer", reason));
  }

  remaining(timer: CookTimer): number {
    return timer.done ? 0 : Math.max(0, timer.end_at - this.ticker.now);
  }
}
