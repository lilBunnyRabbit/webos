import kernel, { type FilesService } from "$lib/core/api";
import { accept_answer, accept_offer, channel_open, create_offer, create_peer, Inbox } from "./peer";
import { part_name, type FileEntry } from "./protocol";
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

function message_of(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "InvalidStateError") return "The connection was lost";
  return reason instanceof Error ? reason.message : String(reason);
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

  protected peer: RTCPeerConnection | null = null;

  protected connect(): RTCPeerConnection {
    this.close();
    this.error = null;
    this.peer = create_peer();
    return this.peer;
  }

  protected fail(pc: RTCPeerConnection, reason: unknown) {
    if (pc !== this.peer) return;
    console.warn("[P2PTransfer]", reason);
    this.error = message_of(reason);
    this.phase = Phase.INTERRUPTED;
    this.close();
  }

  protected finish(pc: RTCPeerConnection) {
    if (pc !== this.peer) return;
    this.phase = Phase.DONE;
    this.close();
  }

  get total(): number {
    return this.entries.reduce((sum, entry) => sum + entry.size, 0);
  }

  get done_bytes(): number {
    return this.progress.reduce((sum, bytes) => sum + bytes, 0);
  }

  close() {
    this.peer?.close();
    this.peer = null;
    this.code = null;
  }
}

export class SendSession extends Session {
  files = $state.raw<File[]>([]);

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
    this.phase = Phase.CONNECTING;
    try {
      const { code, channel } = await create_offer(pc);
      if (pc !== this.peer) return;
      this.code = code;
      const open = await channel_open(pc, channel);
      if (pc !== this.peer) return;
      this.phase = Phase.TRANSFERRING;
      this.progress = this.files.map(() => 0);
      await send_files(open, new Inbox(open, pc), this.files, (index, bytes) => {
        if (pc === this.peer) this.progress[index] = bytes;
      });
      this.finish(pc);
    } catch (reason) {
      this.fail(pc, reason);
    }
  }

  /** Throws when `code` isn't the receiver's answer, so the scanner can say so and keep scanning. */
  async answer(code: string): Promise<void> {
    if (!this.peer) throw new Error("There's no open connection to answer");
    await accept_answer(this.peer, code);
  }

  reset() {
    this.close();
    this.files = [];
    this.entries = [];
    this.progress = [];
    this.error = null;
    this.phase = Phase.SETUP;
  }
}

export class ReceiveSession extends Session {
  /** Downloads path per part name; survives reconnects, so files saved before a drop stay listed. */
  saved = $state<Record<string, string>>({});
  #completed = new Set<string>();

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
    this.code = answer;
    this.phase = Phase.CONNECTING;
    void this.#receive(pc);
  }

  async #receive(pc: RTCPeerConnection) {
    try {
      const channel = await channel_open(pc);
      if (pc !== this.peer) return;
      this.phase = Phase.TRANSFERRING;
      await receive_files(kernel.service<FilesService>("files"), channel, new Inbox(channel, pc), this.#completed, {
        on_manifest: (entries) => {
          this.entries = entries;
          this.progress = entries.map(() => 0);
        },
        on_progress: (index, bytes) => {
          if (pc === this.peer) this.progress[index] = bytes;
        },
        on_saved: (index, path) => {
          this.saved[part_name(this.entries[index])] = path;
        },
      });
      this.finish(pc);
    } catch (reason) {
      this.fail(pc, reason);
    }
  }

  /** Back to scanning. Parts already on disk stay, so the same sender can still resume. */
  rescan() {
    this.close();
    this.error = null;
    this.phase = Phase.SETUP;
  }

  reset() {
    this.rescan();
    this.entries = [];
    this.progress = [];
    this.saved = {};
    this.#completed.clear();
  }
}
