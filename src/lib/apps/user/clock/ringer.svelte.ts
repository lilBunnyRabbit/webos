import kernel, { type JobId, type SchedulerService } from "$lib/core/api";
import { play_chime } from "./chime";

interface Watch {
  hosts: number;
  last_fired: Map<JobId, number | null>;
}

// Per app, shared by every host on the page, so a Clock window and its widget chime once.
const watches = new Map<string, Watch>();

/**
 * Chimes when one of `app`'s jobs fires while the calling component lives. The scheduler shows the notification with
 * or without it; this only adds the sound, in the tab that fired, once the page has had a click (browsers keep audio
 * off until then). Call during component init.
 */
export function ring_while_alive(app: string): void {
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));

  $effect(() => {
    let watch = watches.get(app);
    if (!watch) watches.set(app, (watch = { hosts: 0, last_fired: new Map() }));
    watch.hosts++;
    // Jobs that fire while nothing hosts them mustn't chime when a host comes back.
    return () => void (--watch.hosts === 0 && watches.delete(app));
  });

  $effect(() => {
    const seen = watches.get(app)?.last_fired;
    if (!seen) return;
    let fired = false;
    for (const job of scheduler.jobs) {
      if (job.app !== app) continue;
      const last = job.last_fired ?? null;
      if (last !== null && seen.has(job.id) && seen.get(job.id) !== last) fired = true;
      seen.set(job.id, last);
    }
    if (fired && scheduler.is_leader && navigator.userActivation.hasBeenActive) play_chime();
  });
}
