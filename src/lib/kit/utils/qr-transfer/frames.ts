import { from_base45, to_base45 } from "../base45";

/**
 * Data too big for one QR code, as a cycle of frames (ADR-053): JSON, `deflate-raw`, then Base45 so every frame stays
 * in QR alphanumeric mode. A frame is `WQ1:{APP}:{MSG}:{i}/{n}:{data}`; `{MSG}` tells one share from the next.
 */

const VERSION = "WQ1";
/** Bytes per frame: 240 bytes are 360 Base45 characters, a version 11 QR at ECC L that a phone reads off a screen. */
export const FRAME_BYTES = 240;
const FRAME = /^WQ1:([A-Z0-9]{1,8}):([A-Z0-9]{4}):(\d{1,3})\/(\d{1,3}):([0-9A-Z $%*+\-./:]*)$/;

export interface Frame {
  app: string;
  message: string;
  /** 1-based. */
  index: number;
  total: number;
  data: string;
}

async function through(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function message_id(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => (byte % 36).toString(36))
    .join("")
    .toUpperCase();
}

/** `app` is a short upper-case tag (`SL`, `CARDS`) so one app's scanner ignores another's frames. */
export async function encode_frames(app: string, payload: unknown, frame_bytes = FRAME_BYTES): Promise<string[]> {
  if (!/^[A-Z0-9]{1,8}$/.test(app)) throw new Error(`App tag must be 1–8 upper-case letters or digits, not "${app}"`);
  const bytes = await through(new TextEncoder().encode(JSON.stringify(payload)), new CompressionStream("deflate-raw"));
  const total = Math.max(1, Math.ceil(bytes.length / frame_bytes));
  if (total > 999) throw new Error("Too much for QR codes");
  const message = message_id();
  return Array.from({ length: total }, (_, index) => {
    const data = to_base45(bytes.subarray(index * frame_bytes, (index + 1) * frame_bytes));
    return `${VERSION}:${app}:${message}:${index + 1}/${total}:${data}`;
  });
}

export function parse_frame(text: string): Frame | null {
  const match = text.trim().match(FRAME);
  if (!match) return null;
  const [, app, message, index, total, data] = match;
  const frame = { app, message, index: Number(index), total: Number(total), data };
  return frame.index >= 1 && frame.index <= frame.total ? frame : null;
}

export const CollectResult = {
  /** Not a frame at all. */
  NOT_A_FRAME: "not-a-frame",
  /** A frame of another app. */
  FOREIGN: "foreign",
  /** Already had it. */
  DUPLICATE: "duplicate",
  ADDED: "added",
  /** That was the last one missing. */
  COMPLETE: "complete",
} as const;
export type CollectResult = (typeof CollectResult)[keyof typeof CollectResult];

/** Gathers one message's frames in any order. A frame of a newer message starts over: the sender shared again. */
export class FrameCollector {
  private message: string | null = null;
  private parts = new Map<number, string>();
  private count = 0;

  constructor(private readonly app: string) {}

  get got(): number {
    return this.parts.size;
  }

  get total(): number {
    return this.count;
  }

  get complete(): boolean {
    return this.count > 0 && this.parts.size === this.count;
  }

  /** Which frames are in, 1-based, for a progress row. */
  has(index: number): boolean {
    return this.parts.has(index);
  }

  add(text: string): CollectResult {
    const frame = parse_frame(text);
    if (!frame) return CollectResult.NOT_A_FRAME;
    if (frame.app !== this.app) return CollectResult.FOREIGN;
    if (frame.message !== this.message || frame.total !== this.count) {
      this.message = frame.message;
      this.count = frame.total;
      this.parts.clear();
    }
    if (this.parts.has(frame.index)) return CollectResult.DUPLICATE;
    this.parts.set(frame.index, frame.data);
    return this.complete ? CollectResult.COMPLETE : CollectResult.ADDED;
  }

  reset(): void {
    this.message = null;
    this.count = 0;
    this.parts.clear();
  }

  /** The payload once every frame is in. Throws on a damaged or tampered message. */
  async payload(): Promise<unknown> {
    if (!this.complete) throw new Error("Not every code is in yet");
    const chunks = Array.from({ length: this.count }, (_, index) => from_base45(this.parts.get(index + 1)!));
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder().decode(await through(bytes, new DecompressionStream("deflate-raw")));
    return JSON.parse(text);
  }
}
