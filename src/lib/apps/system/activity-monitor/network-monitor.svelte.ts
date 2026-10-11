import { get_connection, supports_entry_type, type NetworkInformation } from "./browser";

const MAX_ENTRIES = 500;

export interface ConnectionInfo {
  effective_type: string | null;
  downlink: number | null;
  rtt: number | null;
  save_data: boolean;
}

function read_connection(connection: NetworkInformation): ConnectionInfo {
  return {
    effective_type: connection.effectiveType ?? null,
    downlink: connection.downlink ?? null,
    rtt: connection.rtt ?? null,
    save_data: connection.saveData ?? false,
  };
}

function entry_key(entry: PerformanceResourceTiming): string {
  return `${entry.startTime}|${entry.name}`;
}

/** Resource timing since the Activity Monitor opened, plus the connection estimate. Lives for the window's lifetime. */
export class NetworkMonitor {
  readonly resource_supported = supports_entry_type("resource");

  entries = $state.raw<PerformanceResourceTiming[]>([]);
  history_included = $state(false);
  connection = $state.raw<ConnectionInfo | null>(null);

  readonly total_bytes = $derived(this.entries.reduce((sum, entry) => sum + entry.transferSize, 0));

  observe(): () => void {
    const cleanups: (() => void)[] = [];

    if (this.resource_supported) {
      const observer = new PerformanceObserver((list) => {
        this.add(list.getEntries() as PerformanceResourceTiming[]);
      });
      observer.observe({ type: "resource", buffered: false });
      cleanups.push(() => observer.disconnect());
    }

    const connection = get_connection();
    if (connection) {
      const update = () => (this.connection = read_connection(connection));
      update();
      connection.addEventListener("change", update);
      cleanups.push(() => connection.removeEventListener("change", update));
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }

  /** Adds what the browser buffered before the window opened (the boot, lazy chunks). */
  include_history() {
    this.history_included = true;
    this.add(performance.getEntriesByType("resource") as PerformanceResourceTiming[]);
  }

  clear() {
    this.entries = [];
    this.history_included = false;
  }

  private add(entries: PerformanceResourceTiming[]) {
    const seen = new Set(this.entries.map(entry_key));
    const fresh = entries.filter((entry) => !seen.has(entry_key(entry)));
    if (fresh.length === 0) return;
    this.entries = [...this.entries, ...fresh].sort((a, b) => b.startTime - a.startTime).slice(0, MAX_ENTRIES);
  }
}
