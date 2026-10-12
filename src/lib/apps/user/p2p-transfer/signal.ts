/**
 * Squeezes a data-channel-only SDP into a short code that fits a scannable QR code, and rebuilds an SDP from it.
 * Only what WebRTC needs to connect survives: ICE credentials, the DTLS fingerprint, the DTLS role and the UDP
 * candidates. Everything else in the rebuilt SDP is the fixed shape every browser emits for one data channel.
 */

const PREFIX = "WEBOS-P2P1";

export const SignalKind = { OFFER: "o", ANSWER: "a" } as const;
export type SignalKind = (typeof SignalKind)[keyof typeof SignalKind];

const SETUP_ROLES = { actpass: "x", active: "a", passive: "p" } as const;
type SetupRole = keyof typeof SETUP_ROLES;

const CANDIDATE_TYPES = { host: "h", srflx: "s", prflx: "p", relay: "r" } as const;
type CandidateType = keyof typeof CANDIDATE_TYPES;

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

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;
}

const ROLE_BY_CODE = invert(SETUP_ROLES);
const TYPE_BY_CODE = invert(CANDIDATE_TYPES);

function attribute(sdp: string, name: string): string | null {
  const line = sdp.split(/\r?\n/).find((entry) => entry.startsWith(`a=${name}:`));
  return line ? line.slice(name.length + 3).trim() : null;
}

function to_base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function from_base64url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function parse_candidate(line: string): Candidate | null {
  // candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> ...
  const parts = line.replace(/^(a=)?candidate:/, "").trim().split(/\s+/);
  if (parts.length < 8 || parts[6] !== "typ") return null;
  const [, component, transport, , address, port, , type] = parts;
  if (component !== "1" || transport.toLowerCase() !== "udp" || !(type in CANDIDATE_TYPES)) return null;
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
  if (!(setup in SETUP_ROLES)) throw new Error(`Unsupported DTLS role: ${setup}`);

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

export function encode_signal(signal: Signal): string {
  const candidates = signal.candidates
    .map((candidate) => `${CANDIDATE_TYPES[candidate.type]},${candidate.address},${candidate.port}`)
    .join(";");
  return [
    PREFIX,
    signal.kind,
    signal.ufrag,
    signal.pwd,
    to_base64url(signal.fingerprint),
    SETUP_ROLES[signal.setup],
    candidates,
  ].join("|");
}

/** Throws a user-readable error when `code` isn't a WebOS connection code. */
export function decode_signal(code: string): Signal {
  const parts = code.trim().split("|");
  if (parts[0] !== PREFIX || parts.length !== 7) throw new Error("This isn't a P2P Transfer code");
  const [, kind, ufrag, pwd, fingerprint, setup, candidates] = parts;
  if (kind !== SignalKind.OFFER && kind !== SignalKind.ANSWER) throw new Error("This isn't a P2P Transfer code");
  if (!(setup in ROLE_BY_CODE)) throw new Error("This isn't a P2P Transfer code");

  return {
    kind,
    ufrag,
    pwd,
    fingerprint: from_base64url(fingerprint),
    setup: ROLE_BY_CODE[setup as keyof typeof ROLE_BY_CODE],
    candidates: candidates
      ? candidates.split(";").map((entry) => {
          const [type, address, port] = entry.split(",");
          if (!(type in TYPE_BY_CODE) || !address || !Number(port)) throw new Error("The connection code is damaged");
          return { type: TYPE_BY_CODE[type as keyof typeof TYPE_BY_CODE], address, port: Number(port) };
        })
      : [],
  };
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
