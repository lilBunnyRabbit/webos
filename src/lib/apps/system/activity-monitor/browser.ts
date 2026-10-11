// Minimal shapes for browser APIs that TypeScript's DOM lib doesn't ship yet (Chromium-only or still in draft).

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface ScriptTiming extends PerformanceEntry {
  invoker: string;
  invokerType: string;
  sourceURL: string;
  sourceFunctionName: string;
}

export interface LongAnimationFrameTiming extends PerformanceEntry {
  blockingDuration: number;
  scripts: ScriptTiming[];
}

export type PressureState = "nominal" | "fair" | "serious" | "critical";

export interface PressureRecord {
  source: string;
  state: PressureState;
  time: number;
}

export interface PressureObserverInstance {
  observe(source: "cpu", options?: { sampleInterval?: number }): Promise<void>;
  disconnect(): void;
}

export type PressureObserverConstructor = new (
  callback: (records: PressureRecord[]) => void
) => PressureObserverInstance;

export interface NetworkInformation extends EventTarget {
  effectiveType?: string;
  type?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

export interface StorageEstimateWithDetails extends StorageEstimate {
  usageDetails?: Record<string, number>;
}

export function get_memory(): MemoryInfo | null {
  return (performance as Performance & { memory?: MemoryInfo }).memory ?? null;
}

export function get_pressure_observer(): PressureObserverConstructor | null {
  return (
    (globalThis as typeof globalThis & { PressureObserver?: PressureObserverConstructor }).PressureObserver ?? null
  );
}

export function get_connection(): NetworkInformation | null {
  return (navigator as Navigator & { connection?: NetworkInformation }).connection ?? null;
}

export function supports_entry_type(type: string): boolean {
  return PerformanceObserver.supportedEntryTypes.includes(type);
}

/** The longest script of a long animation frame: the most likely culprit. */
export function top_script(frame: LongAnimationFrameTiming): ScriptTiming | null {
  return frame.scripts.reduce<ScriptTiming | null>(
    (top, script) => (!top || script.duration > top.duration ? script : top),
    null
  );
}

/** Same-origin URLs as a path, others as host + path. */
export function short_url(url: string): string {
  try {
    const parsed = new URL(url, location.href);
    const path = parsed.pathname + parsed.search;
    return parsed.origin === location.origin ? path : parsed.host + path;
  } catch {
    return url;
  }
}

export interface LocalStorageGroup {
  /** The `app.{id}.` owner, or `null` for keys outside app storage. */
  app_id: string | null;
  keys: number;
  bytes: number;
}

/** localStorage size per app prefix. Strings are UTF-16, so two bytes per code unit. */
export function local_storage_usage(): LocalStorageGroup[] {
  const groups = new Map<string | null, LocalStorageGroup>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null) continue;
    const match = /^app\.([^.]+)\./.exec(key);
    const app_id = match ? match[1] : null;
    const group = groups.get(app_id) ?? { app_id, keys: 0, bytes: 0 };
    group.keys++;
    group.bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
    groups.set(app_id, group);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes);
}

export function format_ms(ms: number): string {
  return `${Math.round(ms)} ms`;
}
