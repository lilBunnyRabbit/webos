import type { WindowId } from "$lib/core/api";
import { Series } from "./series.svelte";

export interface WindowStats {
  nodes: number;
  /** Mutation records per second over the last sample. */
  rate: number;
  peak: number;
  canvases: number;
  media: number;
  media_playing: number;
  iframes: number;
  history: number[];
}

interface Tracked {
  element: Element;
  observer: MutationObserver;
  count: number;
}

const OBSERVE: MutationObserverInit = { subtree: true, childList: true, attributes: true, characterData: true };

/**
 * DOM activity per window: a MutationObserver on each `[data-window-id]` element, read once a second. Everything it
 * starts lives inside `sample()` and stops with its cleanup, so a closed (or minimized) Activity Monitor costs nothing.
 */
export class WindowMonitor {
  stats = $state.raw(new Map<WindowId, WindowStats>());

  private tracked = new Map<WindowId, Tracked>();
  private peaks = new Map<WindowId, number>();
  private histories = new Map<WindowId, Series>();

  constructor(private readonly list_windows: () => WindowId[]) {}

  sample(): () => void {
    let last = performance.now();
    this.sync();

    const interval = setInterval(() => {
      const now = performance.now();
      const seconds = (now - last) / 1000;
      last = now;
      this.sync();
      this.read(seconds);
    }, 1000);

    return () => {
      clearInterval(interval);
      for (const tracked of this.tracked.values()) tracked.observer.disconnect();
      this.tracked.clear();
    };
  }

  private sync() {
    const ids = new Set(this.list_windows());

    for (const [id, tracked] of this.tracked) {
      if (ids.has(id) && tracked.element.isConnected) continue;
      tracked.observer.disconnect();
      this.tracked.delete(id);
    }
    for (const id of [...this.peaks.keys()]) {
      if (ids.has(id)) continue;
      this.peaks.delete(id);
      this.histories.delete(id);
    }

    for (const id of ids) {
      if (this.tracked.has(id)) continue;
      // The window element can still be missing right after open; the next tick retries.
      const element = document.querySelector(`[data-window-id="${CSS.escape(id)}"]`);
      if (!element) continue;
      const tracked: Tracked = {
        element,
        observer: new MutationObserver((records) => (tracked.count += records.length)),
        count: 0,
      };
      tracked.observer.observe(element, OBSERVE);
      this.tracked.set(id, tracked);
    }
  }

  private read(seconds: number) {
    const stats = new Map<WindowId, WindowStats>();

    for (const [id, tracked] of this.tracked) {
      const rate = seconds > 0 ? tracked.count / seconds : 0;
      tracked.count = 0;

      const peak = Math.max(this.peaks.get(id) ?? 0, rate);
      this.peaks.set(id, peak);

      let history = this.histories.get(id);
      if (!history) this.histories.set(id, (history = new Series()));
      history.push(rate);

      const media = tracked.element.querySelectorAll<HTMLMediaElement>("video, audio");
      stats.set(id, {
        nodes: tracked.element.getElementsByTagName("*").length,
        rate,
        peak,
        canvases: tracked.element.getElementsByTagName("canvas").length,
        media: media.length,
        media_playing: [...media].filter((item) => !item.paused && !item.ended).length,
        iframes: tracked.element.getElementsByTagName("iframe").length,
        history: history.values,
      });
    }

    this.stats = stats;
  }
}
