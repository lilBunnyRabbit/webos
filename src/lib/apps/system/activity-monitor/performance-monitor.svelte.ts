import {
  get_memory,
  get_pressure_observer,
  supports_entry_type,
  type LongAnimationFrameTiming,
  type MemoryInfo,
  type PressureState,
} from "./browser";
import { Series } from "./series.svelte";

const MAX_FRAMES = 50;

export type PressureStatus =
  | { kind: "unsupported" }
  | { kind: "pending" }
  | { kind: "error"; message: string }
  | { kind: "ok"; state: PressureState | null };

/**
 * Page-wide performance while the Activity Monitor is open. `observe()` holds the event-driven observers for the
 * window's lifetime; `sample()` runs the rAF counter and the 1 s tick and is paused while the window is minimized.
 */
export class PerformanceMonitor {
  readonly loaf_supported = supports_entry_type("long-animation-frame");
  readonly memory_supported = get_memory() !== null;

  fps = new Series();
  lag = new Series();
  heap = new Series();
  memory = $state.raw<MemoryInfo | null>(null);
  frames = $state.raw<LongAnimationFrameTiming[]>([]);
  pressure = $state.raw<PressureStatus>({ kind: "unsupported" });
  /** `performance.now()` of the last tick, for "n s ago". */
  now = $state(performance.now());

  observe(): () => void {
    const cleanups: (() => void)[] = [];

    if (this.loaf_supported) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as LongAnimationFrameTiming[];
        this.frames = [...entries.reverse(), ...this.frames].slice(0, MAX_FRAMES);
      });
      observer.observe({ type: "long-animation-frame", buffered: false });
      cleanups.push(() => observer.disconnect());
    }

    const Pressure = get_pressure_observer();
    if (Pressure) {
      this.pressure = { kind: "pending" };
      const observer = new Pressure((records) => {
        const record = records.at(-1);
        if (record) this.pressure = { kind: "ok", state: record.state };
      });
      let active = true;
      observer.observe("cpu", { sampleInterval: 1000 }).then(
        () => {
          if (active && this.pressure.kind === "pending") this.pressure = { kind: "ok", state: null };
        },
        (error: unknown) => {
          if (active)
            this.pressure = { kind: "error", message: error instanceof Error ? error.message : String(error) };
        }
      );
      cleanups.push(() => {
        active = false;
        observer.disconnect();
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }

  sample(): () => void {
    let frames = 0;
    let raf = requestAnimationFrame(function count() {
      frames++;
      raf = requestAnimationFrame(count);
    });

    let last = performance.now();
    let timeout: ReturnType<typeof setTimeout>;
    // A setTimeout chain rather than setInterval: how late each tick fires is the event-loop lag.
    const tick = () => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;

      this.lag.push(Math.max(0, elapsed - 1000));
      this.fps.push((frames * 1000) / elapsed);
      frames = 0;

      const memory = get_memory();
      if (memory) {
        // MemoryInfo fields are prototype getters, so spreading it gives an empty object.
        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = memory;
        this.memory = { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit };
        this.heap.push(memory.usedJSHeapSize);
      }

      this.now = now;
      timeout = setTimeout(tick, 1000);
    };
    timeout = setTimeout(tick, 1000);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }
}
