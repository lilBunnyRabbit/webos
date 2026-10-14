import { decode_signal, encode_signal, read_sdp, SignalKind, write_sdp } from "./signal";

/** Finds each side's public address so peers on different networks can connect. No file data passes through it. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
/** The code is shown once, with every candidate in it. A blocked STUN server must not hold it back forever. */
const GATHER_TIMEOUT = 4000;

export function create_peer(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && finish();
    const timer = setTimeout(finish, GATHER_TIMEOUT);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

async function local_code(pc: RTCPeerConnection, kind: SignalKind): Promise<string> {
  await pc.setLocalDescription();
  await gathered(pc);
  return encode_signal(read_sdp(kind, pc.localDescription!.sdp));
}

/** Sender: opens the data channel and returns the code the receiver scans. */
export async function create_offer(pc: RTCPeerConnection): Promise<{ code: string; channel: RTCDataChannel }> {
  const channel = pc.createDataChannel("files", { ordered: true });
  channel.binaryType = "arraybuffer";
  return { code: await local_code(pc, SignalKind.OFFER), channel };
}

/** Receiver: takes the sender's code and returns the code the sender scans back. */
export async function accept_offer(pc: RTCPeerConnection, code: string): Promise<string> {
  const signal = decode_signal(code);
  if (signal.kind !== SignalKind.OFFER) throw new Error("That's a receiver's code. Scan the code on the sending device");
  await pc.setRemoteDescription(write_sdp(signal));
  return local_code(pc, SignalKind.ANSWER);
}

/** Scanning the same answer twice is harmless; only the first one is applied. */
export async function accept_answer(pc: RTCPeerConnection, code: string): Promise<void> {
  const signal = decode_signal(code);
  if (signal.kind !== SignalKind.ANSWER) throw new Error("That's a sender's code. Scan the code on the receiving device");
  if (pc.signalingState !== "have-local-offer") {
    if (pc.remoteDescription) return;
    throw new Error("This connection isn't waiting for an answer anymore. Generate a new offer");
  }
  await pc.setRemoteDescription(write_sdp(signal));
}

/**
 * Resolves once the channel opens; rejects only if the connection is closed. ICE `failed` isn't final here: the answering
 * side checks the offer's candidates right away and gets no reply until the other device has the answer code, which by
 * hand can take minutes. Chrome reports `failed` after ~15 s, then recovers to `connected` once the late checks arrive.
 */
export function channel_open(pc: RTCPeerConnection, channel?: RTCDataChannel): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      pc.removeEventListener("connectionstatechange", check);
      pc.removeEventListener("datachannel", adopt);
    };
    const check = () => {
      if (pc.connectionState !== "closed") return;
      cleanup();
      reject(new Error("The connection was closed"));
    };
    const watch = (target: RTCDataChannel) => {
      target.binaryType = "arraybuffer";
      if (target.readyState === "open") return (cleanup(), resolve(target));
      target.addEventListener("open", () => (cleanup(), resolve(target)), { once: true });
    };
    const adopt = (event: RTCDataChannelEvent) => watch(event.channel);
    pc.addEventListener("connectionstatechange", check);
    if (channel) watch(channel);
    else pc.addEventListener("datachannel", adopt);
  });
}

/**
 * Reads a channel one message at a time, so each message is fully handled (written to disk) before the next. Messages
 * that arrived before the channel closed are still delivered; after that `next()` rejects.
 */
export class Inbox {
  private readonly queue: (string | ArrayBuffer)[] = [];
  private waiting: { resolve: (data: string | ArrayBuffer) => void; reject: (reason: Error) => void } | null = null;
  private closed: Error | null = null;

  constructor(channel: RTCDataChannel, pc: RTCPeerConnection) {
    channel.addEventListener("message", (event: MessageEvent<string | ArrayBuffer>) => {
      if (this.waiting) this.take().resolve(event.data);
      else this.queue.push(event.data);
    });
    channel.addEventListener("close", () => this.close());
    // SCTP notices a dead path only after its own timeout; ICE says so sooner.
    pc.addEventListener("connectionstatechange", () => pc.connectionState === "failed" && channel.close());
  }

  private take() {
    const waiting = this.waiting!;
    this.waiting = null;
    return waiting;
  }

  private close() {
    this.closed = new Error("The connection was lost");
    if (this.waiting) this.take().reject(this.closed);
  }

  next(): Promise<string | ArrayBuffer> {
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(this.closed);
    return new Promise((resolve, reject) => (this.waiting = { resolve, reject }));
  }
}

export const Route = { LAN: "lan", INTERNET: "internet" } as const;
export type Route = (typeof Route)[keyof typeof Route];

export interface Endpoint {
  /** An IP, or a random `.local` name when the browser hides the LAN address (mDNS). */
  address: string | null;
  port: number | null;
  /** ICE candidate type: `host` (own interface), `srflx` (public address seen by STUN), `prflx`, `relay`. */
  type: string | null;
}

export interface LinkStats {
  route: Route | null;
  /** Seconds, from the last STUN round trip on the selected pair. */
  rtt: number | null;
  local: Endpoint | null;
  remote: Endpoint | null;
  protocol: string | null;
  /** DTLS cipher suite and version protecting the channel. */
  cipher: string | null;
  tls_version: string | null;
  /** Bytes on the wire for this connection, encryption and headers included. */
  bytes_sent: number;
  bytes_received: number;
}

interface CandidateStats {
  address?: string;
  port?: number;
  candidateType?: string;
  protocol?: string;
}

interface TransportStats {
  type: "transport";
  selectedCandidatePairId?: string;
  dtlsCipher?: string;
  tlsVersion?: string;
  bytesSent?: number;
  bytesReceived?: number;
}

function endpoint(candidate: CandidateStats | undefined): Endpoint | null {
  if (!candidate) return null;
  return { address: candidate.address ?? null, port: candidate.port ?? null, type: candidate.candidateType ?? null };
}

/** Which path ICE picked. A remote `prflx` on a local pair is the other device's mDNS host address, learned in-band. */
export async function read_link(pc: RTCPeerConnection): Promise<LinkStats> {
  const stats = await pc.getStats();
  let transport: TransportStats | undefined;
  stats.forEach((report) => {
    if (report.type === "transport") transport = report as TransportStats;
  });
  const pair = transport?.selectedCandidatePairId
    ? (stats.get(transport.selectedCandidatePairId) as RTCIceCandidatePairStats | undefined)
    : undefined;
  const local = pair ? (stats.get(pair.localCandidateId) as CandidateStats | undefined) : undefined;
  const remote = pair ? (stats.get(pair.remoteCandidateId) as CandidateStats | undefined) : undefined;
  const lan = local?.candidateType === "host" && (remote?.candidateType === "host" || remote?.candidateType === "prflx");
  return {
    route: pair ? (lan ? Route.LAN : Route.INTERNET) : null,
    rtt: pair?.currentRoundTripTime ?? null,
    local: endpoint(local),
    remote: endpoint(remote),
    protocol: local?.protocol ?? null,
    cipher: transport?.dtlsCipher ?? null,
    tls_version: transport?.tlsVersion ?? null,
    bytes_sent: transport?.bytesSent ?? 0,
    bytes_received: transport?.bytesReceived ?? 0,
  };
}
