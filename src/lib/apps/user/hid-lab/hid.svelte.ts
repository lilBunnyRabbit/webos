import { report_key, ReportKind, type Report } from "./report";
import { get_hid, reports_from_collections, type Hid, type HidConnectionEvent, type HidDevice, type HidInputReportEvent } from "./webhid";

export interface LiveReport {
  id: number;
  data: Uint8Array;
  count: number;
  at: number;
}

export class HidSession {
  readonly hid: Hid | null = get_hid();
  devices = $state.raw<HidDevice[]>([]);
  selected = $state.raw<HidDevice | null>(null);
  listening = $state(false);
  live = $state.raw<LiveReport[]>([]);
  error = $state<string | null>(null);

  private pending = new Map<number, LiveReport>();
  private frame = 0;
  private opened_here = new Set<HidDevice>();

  readonly reports = $derived(this.selected ? reports_from_collections(this.selected.collections) : []);

  start(): () => void {
    if (!this.hid) return () => {};
    const hid = this.hid;
    void this.refresh();
    const on_change = (event: Event) => {
      if (event.type === "disconnect" && (event as HidConnectionEvent).device === this.selected) this.stop_listening();
      void this.refresh();
    };
    hid.addEventListener("connect", on_change);
    hid.addEventListener("disconnect", on_change);
    return () => {
      hid.removeEventListener("connect", on_change);
      hid.removeEventListener("disconnect", on_change);
      void this.stop_listening();
      cancelAnimationFrame(this.frame);
    };
  }

  async refresh(): Promise<void> {
    if (!this.hid) return;
    this.devices = await this.hid.getDevices();
    if (this.selected && !this.devices.includes(this.selected)) this.selected = null;
    this.selected ??= this.devices[0] ?? null;
  }

  async request(): Promise<void> {
    if (!this.hid) return;
    this.error = null;
    try {
      const [device] = await this.hid.requestDevice({ filters: [] });
      await this.refresh();
      if (device) this.select(device);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  select(device: HidDevice): void {
    if (device === this.selected) return;
    void this.stop_listening();
    this.selected = device;
  }

  async listen(): Promise<void> {
    const device = this.selected;
    if (!device) return;
    this.error = null;
    try {
      if (!device.opened) {
        await device.open();
        this.opened_here.add(device);
      }
      device.addEventListener("inputreport", this.on_report);
      this.listening = true;
      this.devices = [...this.devices];
    } catch (error) {
      this.error = `Couldn't open it: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async stop_listening(): Promise<void> {
    const device = this.selected;
    this.listening = false;
    this.live = [];
    this.pending.clear();
    if (!device) return;
    device.removeEventListener("inputreport", this.on_report);
    if (this.opened_here.delete(device) && device.opened) await device.close().catch(() => {});
    this.devices = [...this.devices];
  }

  async forget(): Promise<void> {
    const device = this.selected;
    if (!device) return;
    await this.stop_listening();
    await device.forget();
    this.selected = null;
    await this.refresh();
  }

  input_report(id: number): Report | undefined {
    return this.reports.find((report) => report_key(report.kind, report.id) === report_key(ReportKind.INPUT, id));
  }

  // Gamepads report up to 1000 times a second; the view takes the latest per report ID once a frame.
  private on_report = (event: Event) => {
    const { reportId, data } = event as HidInputReportEvent;
    const previous = this.pending.get(reportId) ?? this.live.find((report) => report.id === reportId);
    this.pending.set(reportId, {
      id: reportId,
      data: new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
      count: (previous?.count ?? 0) + 1,
      at: event.timeStamp,
    });
    if (!this.frame) this.frame = requestAnimationFrame(this.flush);
  };

  private flush = () => {
    this.frame = 0;
    const merged = new Map(this.live.map((report) => [report.id, report]));
    for (const [id, report] of this.pending) merged.set(id, report);
    this.pending.clear();
    this.live = [...merged.values()].sort((a, b) => a.id - b.id);
  };
}
