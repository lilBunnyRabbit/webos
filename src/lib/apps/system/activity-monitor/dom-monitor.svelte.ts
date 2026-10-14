import { Series } from "./series.svelte";

export interface DomStats {
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
 * DOM activity per key (a window, a desktop widget): a MutationObserver on the element `find` returns for each key,
 * read once a second. Everything it starts lives inside `sample()` and stops with its cleanup, so a closed (or
 * minimized) Activity Monitor costs nothing.
 */
export class DomMonitor<K extends string> {
  stats = $state.raw(new Map<K, DomStats>());

  private tracked = new Map<K, Tracked>();
  private peaks = new Map<K, number>();
  private histories = new Map<K, Series>();

  constructor(
    private readonly list: () => K[],
    private readonly find: (key: K) => Element | null
  ) {}

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
    const ids = new Set(this.list());

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
      // The element can still be missing right after open; the next tick retries.
      const element = this.find(id);
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
    const stats = new Map<K, DomStats>();

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
