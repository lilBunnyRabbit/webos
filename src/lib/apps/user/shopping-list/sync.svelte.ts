import { error_message } from "$lib/core/utils";
import { accept_answer, accept_offer, channel_open, create_offer, create_peer } from "$kit/utils/p2p";
import type { Item, List, ListMeta } from "./data";
import { item_key, unsent } from "./merge";
import { CHANNEL_LABEL, parse_message, SYNC_VERSION, type SyncMessage } from "./sync";

export const PairState = {
  IDLE: "idle",
  /** This device started: its code is on screen, waiting to scan the other device's answer. */
  OFFER: "offer",
  /** This device joined: its answer is on screen, waiting for the other device to scan it. */
  ANSWER: "answer",
  CONNECTING: "connecting",
  LIVE: "live",
  /** Was live, and the connection dropped. Pairing again merges what changed meanwhile. */
  OFFLINE: "offline",
} as const;
export type PairState = (typeof PairState)[keyof typeof PairState];

export interface SyncHost {
  list(id: string): List | undefined;
  /** Merges `items` into the list; `meta` creates the list when this device doesn't have it yet. */
  merge(list_id: string, items: Item[], meta: ListMeta | null): void;
}

export const NO_PATH =
  "No direct path between the phones. Mobile data often blocks one; put both on the same Wi-Fi, or connect one to the other's hotspot";

/** One window's live link to one other device, sharing one list. A new pairing replaces the old peer. */
export class PairSession {
  state = $state<PairState>(PairState.IDLE);
  /** The code this device shows: the offer when it started, the answer when it joined. */
  code = $state<string | null>(null);
  list_id = $state<string | null>(null);
  error = $state<string | null>(null);

  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  /** What the other device is known to hold, per item id. Anything else is sent. */
  private readonly known = new Map<string, string>();

  constructor(private readonly host: SyncHost) {}

  get pairing(): boolean {
    return this.state === PairState.OFFER || this.state === PairState.ANSWER || this.state === PairState.CONNECTING;
  }

  async start(list_id: string): Promise<void> {
    const pc = this.connect();
    this.list_id = list_id;
    this.state = PairState.OFFER;
    try {
      const { code, channel } = await create_offer(pc, CHANNEL_LABEL);
      if (pc !== this.peer) return;
      this.code = code;
      void this.open(pc, channel_open(pc, channel), true);
    } catch (reason) {
      if (pc === this.peer) this.fail(reason);
    }
  }

  /** Throws when `code` isn't the answer, so the scanner can say so and keep looking. */
  async answer(code: string): Promise<void> {
    const pc = this.peer;
    if (!pc || this.state !== PairState.OFFER) throw new Error("This phone isn't waiting for an answer anymore. Share the list again");
    await accept_answer(pc, code);
    if (pc !== this.peer) return;
    this.code = null;
    this.state = PairState.CONNECTING;
  }

  /** Throws when `code` isn't an offer, so the scanner can say so and keep looking. */
  async join(code: string): Promise<void> {
    const pc = this.connect();
    this.list_id = null;
    let answer: string;
    try {
      answer = await accept_offer(pc, code);
    } catch (reason) {
      if (pc === this.peer) this.stop();
      throw reason;
    }
    if (pc !== this.peer) return;
    this.code = answer;
    this.state = PairState.ANSWER;
    void this.open(pc, channel_open(pc), false);
  }

  /** Sends what the other device doesn't have yet. Called with the shared list's items whenever they change. */
  push(items: Item[]): void {
    if (this.state !== PairState.LIVE || !this.channel) return;
    const changed = unsent(items, this.known);
    if (changed.length === 0) return;
    for (const item of changed) this.known.set(item.id, item_key(item));
    this.send({ type: "items", items: changed });
  }

  /** Stops sharing: the list stays as it is on both devices. */
  stop(): void {
    this.close_peer();
    this.state = PairState.IDLE;
    this.code = null;
    this.list_id = null;
  }

  dispose(): void {
    this.close_peer();
  }

  private connect(): RTCPeerConnection {
    this.close_peer();
    this.error = null;
    this.code = null;
    this.known.clear();
    const pc = create_peer();
    this.peer = pc;
    pc.addEventListener("connectionstatechange", () => {
      if (pc !== this.peer) return;
      // Before the answer is in, `failed` can still recover: the other phone may not have scanned yet (see channel_open).
      if (pc.connectionState === "failed" && this.state === PairState.CONNECTING) this.fail(new Error(NO_PATH));
      if (pc.connectionState === "failed" && this.state === PairState.LIVE) this.channel?.close();
    });
    return pc;
  }

  private async open(pc: RTCPeerConnection, opening: Promise<RTCDataChannel>, started: boolean): Promise<void> {
    let channel: RTCDataChannel;
    try {
      channel = await opening;
    } catch (reason) {
      if (pc === this.peer) this.fail(reason);
      return;
    }
    if (pc !== this.peer) return channel.close();
    if (channel.label !== CHANNEL_LABEL) {
      this.fail(new Error("That code is from another app. Scan the code Shopping List shows"));
      return;
    }
    this.channel = channel;
    this.code = null;
    this.error = null;
    this.state = PairState.LIVE;
    channel.addEventListener("message", (event: MessageEvent<unknown>) => pc === this.peer && this.receive(event.data));
    channel.addEventListener("close", () => {
      if (pc !== this.peer) return;
      this.close_peer();
      this.state = PairState.OFFLINE;
    });

    if (!started || !this.list_id) return;
    const list = this.host.list(this.list_id);
    if (!list) return this.fail(new Error("The list is gone"));
    const items = $state.snapshot(list.items) as Item[];
    for (const item of items) this.known.set(item.id, item_key(item));
    this.send({ type: "hello", version: SYNC_VERSION, list: { id: list.id, name: list.name, color: list.color }, items });
  }

  private receive(data: unknown): void {
    const message = parse_message(data);
    if (!message) return console.warn("[ShoppingList] ignored a message it doesn't understand");
    if (message.type === "hello") this.list_id = message.list.id;
    if (!this.list_id) return;
    // Recorded first: what the merge keeps from the other side then isn't sent straight back.
    for (const item of message.items) this.known.set(item.id, item_key(item));
    this.host.merge(this.list_id, message.items, message.type === "hello" ? message.list : null);
  }

  private send(message: SyncMessage): void {
    try {
      this.channel?.send(JSON.stringify(message));
    } catch (reason) {
      console.warn("[ShoppingList] send failed", reason);
    }
  }

  private fail(reason: unknown): void {
    this.error = error_message(reason);
    const was_live = this.state === PairState.LIVE || this.state === PairState.OFFLINE;
    this.close_peer();
    this.code = null;
    this.state = was_live ? PairState.OFFLINE : PairState.IDLE;
  }

  private close_peer(): void {
    const pc = this.peer;
    this.peer = null;
    this.channel = null;
    pc?.close();
  }
}
