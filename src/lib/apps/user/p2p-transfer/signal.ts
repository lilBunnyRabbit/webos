/**
 * Squeezes a data-channel-only SDP into a short code that fits a scannable QR code, and rebuilds an SDP from it.
 * Only what WebRTC needs to connect survives: ICE credentials, the DTLS fingerprint, the DTLS role and the UDP
 * candidates, packed as bytes and written in Base45 (RFC 9285). Base45 uses only the characters of a QR code's
 * alphanumeric mode, which stores 5.5 bits per character instead of 8, so the QR comes out a few versions smaller.
 * Everything else in the rebuilt SDP is the fixed shape every browser emits for one data channel.
 */

const FORMAT_VERSION = 1;

export const SignalKind = { OFFER: "o", ANSWER: "a" } as const;
export type SignalKind = (typeof SignalKind)[keyof typeof SignalKind];

/** Index order is the wire format. */
const SETUP_ROLES = ["actpass", "active", "passive"] as const;
type SetupRole = (typeof SETUP_ROLES)[number];

const CANDIDATE_TYPES = ["host", "srflx", "prflx", "relay"] as const;
type CandidateType = (typeof CANDIDATE_TYPES)[number];

/** Local candidates first, so a same-network pair is tried before a route through the router. */
const TYPE_PREFERENCE: Record<CandidateType, number> = { host: 126, prflx: 110, srflx: 100, relay: 0 };

export interface Candidate {
  type: CandidateType;
  address: string;
  port: number;
}

export interface Signal {
  kind: SignalKind;
  ufrag: string;
  pwd: string;
  /** SHA-256 certificate fingerprint, 32 bytes. */
  fingerprint: Uint8Array;
  setup: SetupRole;
  candidates: Candidate[];
}

function attribute(sdp: string, name: string): string | null {
  const line = sdp.split(/\r?\n/).find((entry) => entry.startsWith(`a=${name}:`));
  return line ? line.slice(name.length + 3).trim() : null;
}

export function parse_candidate(line: string): Candidate | null {
  // candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> ...
  const parts = line.replace(/^(a=)?candidate:/, "").trim().split(/\s+/);
  if (parts.length < 8 || parts[6] !== "typ") return null;
  const [, component, transport, , address, port, , type] = parts;
  if (component !== "1" || transport.toLowerCase() !== "udp" || !CANDIDATE_TYPES.includes(type as CandidateType)) return null;
  return { type: type as CandidateType, address, port: Number(port) };
}

/** Reads the parts of `sdp` that `encode_signal` keeps. Throws when the SDP can't be represented. */
export function read_sdp(kind: SignalKind, sdp: string): Signal {
  const ufrag = attribute(sdp, "ice-ufrag");
  const pwd = attribute(sdp, "ice-pwd");
  const fingerprint = attribute(sdp, "fingerprint");
  const setup = attribute(sdp, "setup");
  if (!ufrag || !pwd || !fingerprint || !setup) throw new Error("The connection offer is incomplete");

  const [algorithm, hex] = fingerprint.split(" ");
  if (algorithm.toLowerCase() !== "sha-256" || !hex) throw new Error(`Unsupported certificate fingerprint: ${algorithm}`);
  if (!SETUP_ROLES.includes(setup as SetupRole)) throw new Error(`Unsupported DTLS role: ${setup}`);

  const seen = new Set<string>();
  const candidates = sdp
    .split(/\r?\n/)
    .filter((line) => line.startsWith("a=candidate:"))
    .map(parse_candidate)
    .filter((candidate): candidate is Candidate => {
      if (!candidate) return false;
      const key = `${candidate.address} ${candidate.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    kind,
    ufrag,
    pwd,
    fingerprint: Uint8Array.from(hex.split(":"), (byte) => parseInt(byte, 16)),
    setup: setup as SetupRole,
    candidates,
  };
}

const BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function to_base45(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 === bytes.length) {
      const value = bytes[index];
      text += BASE45[value % 45] + BASE45[Math.floor(value / 45)];
    } else {
      const value = bytes[index] * 256 + bytes[index + 1];
      text += BASE45[value % 45] + BASE45[Math.floor(value / 45) % 45] + BASE45[Math.floor(value / 2025)];
    }
  }
  return text;
}

export function from_base45(text: string): Uint8Array {
  const digits = Array.from(text, (char) => BASE45.indexOf(char));
  if (digits.includes(-1) || digits.length % 3 === 1) throw new Error("not base45");
  const bytes: number[] = [];
  for (let index = 0; index < digits.length; index += 3) {
    const [c, d, e] = digits.slice(index, index + 3);
    if (e === undefined) {
      const value = c + d * 45;
      if (value > 255) throw new Error("not base45");
      bytes.push(value);
    } else {
      const value = c + d * 45 + e * 2025;
      if (value > 65535) throw new Error("not base45");
      bytes.push(value >> 8, value & 255);
    }
  }
  return Uint8Array.from(bytes);
}

const ICE_CHARS = /^[A-Za-z0-9+/]+$/;
const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const AddressKind = { IPV4: 0, MDNS: 1, TEXT: 2 } as const;

class Writer {
  bytes: number[] = [];

  byte(value: number) {
    this.bytes.push(value & 255);
  }

  raw(values: ArrayLike<number>) {
    for (let index = 0; index < values.length; index++) this.byte(values[index]);
  }

  text(value: string) {
    if (value.length > 255) throw new Error("The connection offer has an unexpectedly long field");
    this.byte(value.length);
    this.raw(Array.from(value, (char) => char.charCodeAt(0)));
  }

  /** ICE ufrag and password use the base64 alphabet; four characters pack into three bytes. */
  ice(value: string) {
    if (ICE_CHARS.test(value) && value.length % 4 === 0 && value.length <= 168) {
      const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
      this.byte(0x80 | bytes.length);
      this.raw(bytes);
    } else {
      if (value.length > 127) throw new Error("The connection offer has an unexpectedly long field");
      this.text(value);
    }
  }
}

class Reader {
  private at = 0;

  constructor(private readonly bytes: Uint8Array) {}

  byte(): number {
    if (this.at >= this.bytes.length) throw new Error("truncated");
    return this.bytes[this.at++];
  }

  raw(length: number): Uint8Array {
    if (this.at + length > this.bytes.length) throw new Error("truncated");
    return this.bytes.slice(this.at, (this.at += length));
  }

  text(length = this.byte()): string {
    return String.fromCharCode(...this.raw(length));
  }

  ice(): string {
    const head = this.byte();
    if (head & 0x80) return btoa(String.fromCharCode(...this.raw(head & 0x7f)));
    return this.text(head);
  }

  get done(): boolean {
    return this.at === this.bytes.length;
  }
}

export function encode_signal(signal: Signal): string {
  const writer = new Writer();
  writer.byte((FORMAT_VERSION << 4) | (signal.kind === SignalKind.ANSWER ? 0x08 : 0) | SETUP_ROLES.indexOf(signal.setup));
  writer.ice(signal.ufrag);
  writer.ice(signal.pwd);
  writer.raw(signal.fingerprint);
  writer.byte(signal.candidates.length);
  for (const candidate of signal.candidates) {
    const type = CANDIDATE_TYPES.indexOf(candidate.type) << 4;
    const mdns = candidate.address.match(MDNS);
    const ipv4 = candidate.address.match(IPV4);
    if (mdns) {
      writer.byte(type | AddressKind.MDNS);
      const hex = mdns.slice(1).join("");
      writer.raw(Array.from({ length: 16 }, (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16)));
    } else if (ipv4) {
      writer.byte(type | AddressKind.IPV4);
      writer.raw(ipv4.slice(1).map(Number));
    } else {
      writer.byte(type | AddressKind.TEXT);
      writer.text(candidate.address);
    }
    writer.byte(candidate.port >> 8);
    writer.byte(candidate.port);
  }
  return to_base45(Uint8Array.from(writer.bytes));
}

function read_address(reader: Reader, kind: number): string {
  if (kind === AddressKind.IPV4) return Array.from(reader.raw(4)).join(".");
  if (kind === AddressKind.MDNS) {
    const hex = Array.from(reader.raw(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
  }
  if (kind === AddressKind.TEXT) return reader.text();
  throw new Error("unknown address kind");
}

/** Throws a user-readable error when `code` isn't a P2P Transfer code. Line breaks from pasting are ignored. */
export function decode_signal(code: string): Signal {
  try {
    const reader = new Reader(from_base45(code.replace(/[\r\n\t]/g, "")));
    const head = reader.byte();
    if (head >> 4 !== FORMAT_VERSION || (head & 0x03) > 2) throw new Error("wrong version");
    const signal: Signal = {
      kind: head & 0x08 ? SignalKind.ANSWER : SignalKind.OFFER,
      setup: SETUP_ROLES[head & 0x03],
      ufrag: reader.ice(),
      pwd: reader.ice(),
      fingerprint: reader.raw(32),
      candidates: [],
    };
    const count = reader.byte();
    for (let index = 0; index < count; index++) {
      const head = reader.byte();
      const type = CANDIDATE_TYPES[head >> 4];
      if (!type) throw new Error("unknown candidate type");
      const address = read_address(reader, head & 0x0f);
      const port = (reader.byte() << 8) | reader.byte();
      signal.candidates.push({ type, address, port });
    }
    if (!reader.done) throw new Error("trailing bytes");
    return signal;
  } catch {
    throw new Error("This isn't a P2P Transfer code");
  }
}

function candidate_line(candidate: Candidate, index: number): string {
  // RFC 8445 priority: type preference, then local preference, then component 1.
  const priority = TYPE_PREFERENCE[candidate.type] * 2 ** 24 + (65535 - index) * 2 ** 8 + 255;
  const related = candidate.type === "host" ? "" : " raddr 0.0.0.0 rport 0";
  return `a=candidate:${index + 1} 1 udp ${priority} ${candidate.address} ${candidate.port} typ ${candidate.type}${related}`;
}

export function write_sdp(signal: Signal): RTCSessionDescriptionInit {
  const fingerprint = [...signal.fingerprint].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(":");
  const lines = [
    "v=0",
    "o=- 0 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    ...signal.candidates.map(candidate_line),
    "a=end-of-candidates",
    `a=ice-ufrag:${signal.ufrag}`,
    `a=ice-pwd:${signal.pwd}`,
    `a=fingerprint:sha-256 ${fingerprint}`,
    `a=setup:${signal.setup}`,
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:262144",
  ];
  return { type: signal.kind === SignalKind.OFFER ? "offer" : "answer", sdp: `${lines.join("\r\n")}\r\n` };
}
