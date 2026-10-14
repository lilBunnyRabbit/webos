import kernel, { type FilesService } from "$lib/core/api";
import { format_bytes } from "$lib/core/utils";
import { accept_answer, accept_offer, channel_open, create_offer, create_peer, Inbox, read_link, type Endpoint, type LinkStats } from "./peer";
import { part_name, type FileEntry } from "./protocol";
import { decode_signal } from "./signal";
import { describe_file, receive_files, send_files } from "./transfer";

export const Phase = {
  /** Sender picks files; receiver scans the sender's code. */
  SETUP: "setup",
  /** A code is on screen and the other device hasn't connected yet. */
  CONNECTING: "connecting",
  TRANSFERRING: "transferring",
  /** The connection dropped or failed. Reconnecting resumes where it stopped. */
  INTERRUPTED: "interrupted",
  DONE: "done",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const LogTone = { INFO: "info", OK: "ok", ERROR: "error" } as const;
export type LogTone = (typeof LogTone)[keyof typeof LogTone];

export interface LogLine {
  id: number;
  /** Milliseconds since the session's first line. */
  at: number;
  text: string;
  tone: LogTone;
}

export const NO_PATH =
  "No direct path between the devices. Mobile data often blocks one; put both on the same Wi-Fi, or connect one to the other's hotspot";

const LOG_LIMIT = 200;
const SAMPLE_MS = 500;
/** 20 s of throughput at one sample per tick, for the graph. */
const SAMPLE_COUNT = 40;
const STALL_MS = 10_000;
/** Below this the smoothed rate is decay noise, not data: show nothing rather than `3e-20 B/s`. */
const MIN_RATE = 1;

function message_of(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "InvalidStateError") return "The connection was lost";
  return reason instanceof Error ? reason.message : String(reason);
}

/** Browsers blank out LAN addresses in stats (and swap them for `.local` names in SDP), so only the port is real then. */
export function format_endpoint(endpoint: Endpoint | null): string {
  if (!endpoint?.port) return "—";
  const { address, port } = endpoint;
  if (!address || address.endsWith(".local")) return `private:${port}`;
  return `${address.includes(":") ? `[${address}]` : address}:${port}`;
}

/** `getStats()` reports the DTLS version as the wire value in hex: FEFD is DTLS 1.2. */
export function tls_name(version: string): string {
  return { FEFD: "DTLS 1.2", FEFC: "DTLS 1.3" }[version.toUpperCase()] ?? `DTLS ${version}`;
}

function describe_candidates(code: string): string {
  const { candidates } = decode_signal(code);
  const types = [...new Set(candidates.map((candidate) => candidate.type))].join(", ");
  return `${candidates.length} ICE candidate${candidates.length === 1 ? "" : "s"}${types ? ` (${types})` : ""}`;
}

/** One side of a transfer. Each connection gets a fresh peer; a stale one's late events are ignored. */
abstract class Session {
  phase = $state<Phase>(Phase.SETUP);
  /** The code this device shows: the offer on the sender, the answer on the receiver. */
  code = $state<string | null>(null);
  entries = $state.raw<FileEntry[]>([]);
  /** Bytes held per entry: sent on the sender, written on the receiver. */
  progress = $state<number[]>([]);
  error = $state<string | null>(null);
  log = $state.raw<LogLine[]>([]);
  /** The live connection as WebRTC reports it; kept after a drop so the last route stays visible. */
  link = $state.raw<LinkStats | null>(null);
  /** Bytes per second, smoothed over the last sample. */
  rate = $state(0);
  samples = $state.raw<number[]>([]);
  /** The link is up but progress hasn't moved for `STALL_MS`: usually the other device's screen went off. */
  stalled = $state(false);

  protected peer: RTCPeerConnection | null = null;
  private log_start = 0;
  private log_id = 0;
  private sampler = 0;

  get total(): number {
    return this.entries.reduce((sum, entry) => sum + entry.size, 0);
  }

  get done_bytes(): number {
    return this.progress.reduce((sum, bytes) => sum + bytes, 0);
  }

  /** Seconds left at the current rate, `null` while there's no rate to go by. */
  get eta(): number | null {
    return this.rate >= MIN_RATE ? (this.total - this.done_bytes) / this.rate : null;
  }

  protected write(text: string, tone: LogTone = LogTone.INFO) {
    const now = performance.now();
    if (this.log.length === 0) this.log_start = now;
    this.log = [...this.log, { id: this.log_id++, at: now - this.log_start, text, tone }].slice(-LOG_LIMIT);
  }

  protected connect(): RTCPeerConnection {
    this.close();
    this.error = null;
    this.peer = create_peer();
    const pc = this.peer;
    pc.addEventListener("connectionstatechange", () => {
      if (pc !== this.peer) return;
      const state = pc.connectionState;
      if (state === "connected") this.write("DTLS handshake complete, link up", LogTone.OK);
      else if (state === "disconnected") this.write("Link quiet, waiting for it to recover");
      else if (state === "failed" && this.phase === Phase.CONNECTING) this.failed_while_connecting(pc);
    });
    return pc;
  }

  /** Before the channel opens, ICE `failed` can still recover: the other device may not have this side's code yet. */
  protected failed_while_connecting(_pc: RTCPeerConnection) {
    this.write("No reply yet, still listening for the other device");
  }

  protected start_sampling(pc: RTCPeerConnection) {
    let last = this.done_bytes;
    let moved_at = performance.now();
    this.rate = 0;
    this.samples = [];
    this.stalled = false;
    clearInterval(this.sampler);
    this.sampler = window.setInterval(async () => {
      const bytes = this.done_bytes;
      const now = performance.now();
      const instant = ((bytes - last) * 1000) / SAMPLE_MS;
      if (bytes !== last) moved_at = now;
      last = bytes;
      const smoothed = this.rate === 0 ? instant : this.rate * 0.6 + instant * 0.4;
      this.rate = smoothed < MIN_RATE ? 0 : smoothed;
      this.samples = [...this.samples, instant].slice(-SAMPLE_COUNT);
      const stalled = this.phase === Phase.TRANSFERRING && this.done_bytes < this.total && now - moved_at > STALL_MS;
      if (stalled && !this.stalled) this.write("Stalled: no data confirmed for 10 s. Keep both screens on with P2P Transfer in front", LogTone.ERROR);
      if (!stalled && this.stalled) this.write("Data moving again", LogTone.OK);
      this.stalled = stalled;
      const link = await read_link(pc).catch(() => null);
      if (link?.route && pc === this.peer) {
        if (link.route !== this.link?.route) {
          const where = link.route === "lan" ? "same network" : "across networks, addresses found via STUN";
          this.write(`Route: direct, ${where}. ${link.protocol?.toUpperCase() ?? "UDP"} ${format_endpoint(link.local)} ⇄ ${format_endpoint(link.remote)}`);
          if (link.cipher) this.write(`Encrypted: ${link.tls_version ? `${tls_name(link.tls_version)} ` : ""}${link.cipher}`);
        }
        this.link = link;
      }
    }, SAMPLE_MS);
  }

  protected fail(pc: RTCPeerConnection, reason: unknown) {
    if (pc !== this.peer) return;
    console.warn("[P2PTransfer]", reason);
    this.error = message_of(reason);
    this.write(this.error, LogTone.ERROR);
    this.phase = Phase.INTERRUPTED;
    this.close();
  }

  protected finish(pc: RTCPeerConnection, text: string) {
    if (pc !== this.peer) return;
    this.write(text, LogTone.OK);
    this.phase = Phase.DONE;
    this.close();
  }

  protected log_resume(offsets: (number | null)[]) {
    const held = offsets.reduce<number>((sum, offset, index) => sum + (offset ?? this.entries[index]?.size ?? 0), 0);
    if (held > 0) this.write(`Resuming: ${format_bytes(held)} already on the receiver`);
  }

  close() {
    clearInterval(this.sampler);
    this.rate = 0;
    this.stalled = false;
    this.peer?.close();
    this.peer = null;
    this.code = null;
  }

  protected clear() {
    this.close();
    this.entries = [];
    this.progress = [];
    this.error = null;
    this.log = [];
    this.samples = [];
    this.link = null;
    this.phase = Phase.SETUP;
  }
}

export class SendSession extends Session {
  files = $state.raw<File[]>([]);
  /** The receiver's answer is in; what's left is ICE and DTLS on their own. */
  answered = $state(false);
  /** Every byte is handed to the channel; progress now waits on the receiver's confirmations. */
  queued = $state(false);

  add(files: File[]) {
    this.files = [...this.files, ...files];
    this.entries = this.files.map(describe_file);
  }

  remove(index: number) {
    this.files = this.files.filter((_, at) => at !== index);
    this.entries = this.files.map(describe_file);
  }

  /** Shows a new offer code and sends once the receiver connects. Also how an interrupted transfer resumes. */
  async offer(): Promise<void> {
    const pc = this.connect();
    this.answered = false;
    this.queued = false;
    this.phase = Phase.CONNECTING;
    this.write(`Gathering ICE candidates for ${this.files.length} file${this.files.length === 1 ? "" : "s"}`);
    try {
      const { code, channel } = await create_offer(pc);
      if (pc !== this.peer) return;
      this.code = code;
      this.write(`Offer ready: ${describe_candidates(code)}, ${code.length} B`);
      const open = await channel_open(pc, channel);
      if (pc !== this.peer) return;
      this.write("Data channel open", LogTone.OK);
      this.phase = Phase.TRANSFERRING;
      this.progress = this.files.map(() => 0);
      this.start_sampling(pc);
      await send_files(open, new Inbox(open, pc), this.files, {
        on_resume: (offsets) => {
          offsets.forEach((offset, index) => offset === null && (this.progress[index] = this.entries[index].size));
          this.log_resume(offsets);
        },
        on_progress: (index, bytes) => {
          if (pc !== this.peer) return;
          if (bytes === this.entries[index].size && this.progress[index] !== bytes) this.write(`Receiver confirmed ${this.entries[index].name}`, LogTone.OK);
          this.progress[index] = bytes;
        },
        on_queued: () => {
          if (pc !== this.peer) return;
          this.queued = true;
          if (this.done_bytes < this.total) this.write("All data handed to the network, waiting for the receiver to confirm");
        },
      });
      this.finish(pc, "Receiver confirmed every file");
    } catch (reason) {
      this.fail(pc, reason);
    }
  }

  /**
   * With the answer in, both sides have every candidate and have checked them all, so `failed` is final. The usual cause
   * is a mobile carrier's symmetric NAT; without a relay (ADR-032: none, by choice) there's no path across it.
   */
  protected override failed_while_connecting(pc: RTCPeerConnection) {
    if (!this.answered) return super.failed_while_connecting(pc);
    this.fail(pc, new Error(NO_PATH));
  }

  /** Throws when `code` isn't the receiver's answer, so the scanner can say so and keep scanning. */
  async answer(code: string): Promise<void> {
    if (!this.peer) throw new Error("There's no open connection to answer");
    if (this.answered) return;
    await accept_answer(this.peer, code);
    this.answered = true;
    this.write(`Answer accepted: ${describe_candidates(code)}. Connecting`);
  }

  reset() {
    this.clear();
    this.files = [];
  }
}

export class ReceiveSession extends Session {
  /** Downloads path per part name; survives reconnects, so files saved before a drop stay listed. */
  saved = $state<Record<string, string>>({});
  private readonly completed = new Set<string>();

  saved_path(entry: FileEntry): string | null {
    return this.saved[part_name(entry)] ?? null;
  }

  /** Throws when `code` isn't a sender's offer, so the scanner can say so and keep scanning. */
  async accept(offer: string): Promise<void> {
    const pc = this.connect();
    let answer: string;
    try {
      answer = await accept_offer(pc, offer);
    } catch (reason) {
      if (pc === this.peer) this.close();
      throw reason;
    }
    if (pc !== this.peer) return;
    this.write(`Offer accepted: ${describe_candidates(offer)}`);
    this.write(`Answer ready: ${describe_candidates(answer)}, ${answer.length} B`);
    this.code = answer;
    this.phase = Phase.CONNECTING;
    void this.receive(pc);
  }

  private async receive(pc: RTCPeerConnection) {
    try {
      const channel = await channel_open(pc);
      if (pc !== this.peer) return;
      this.write("Data channel open", LogTone.OK);
      this.phase = Phase.TRANSFERRING;
      this.start_sampling(pc);
      await receive_files(kernel.service<FilesService>("files"), channel, new Inbox(channel, pc), this.completed, {
        on_manifest: (entries) => {
          this.entries = entries;
          this.progress = entries.map(() => 0);
          const total = entries.reduce((sum, entry) => sum + entry.size, 0);
          this.write(`Manifest: ${entries.length} file${entries.length === 1 ? "" : "s"}, ${format_bytes(total)}`);
        },
        on_resume: (offsets) => this.log_resume(offsets),
        on_progress: (index, bytes) => {
          if (pc === this.peer) this.progress[index] = bytes;
        },
        on_saved: (index, path) => {
          this.saved[part_name(this.entries[index])] = path;
          this.write(`Saved ${path}`, LogTone.OK);
        },
      });
      this.finish(pc, "Every file saved");
    } catch (reason) {
      this.fail(pc, reason);
    }
  }

  /** Back to scanning. Parts already on disk stay, so the same sender can still resume. */
  rescan() {
    this.close();
    this.error = null;
    this.phase = Phase.SETUP;
    this.write("Waiting for a new offer to resume");
  }

  reset() {
    this.clear();
    this.saved = {};
    this.completed.clear();
  }
}
