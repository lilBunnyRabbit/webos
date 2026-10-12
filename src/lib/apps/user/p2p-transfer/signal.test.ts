import { encode } from "uqr";
import { describe, expect, test } from "vitest";
import { decode_signal, encode_signal, from_base45, parse_candidate, read_sdp, SignalKind, to_base45, write_sdp } from "./signal";

const FINGERPRINT =
  "5C:7E:0F:3B:9A:21:44:D8:6E:11:02:BB:7C:90:3D:AF:E1:58:6A:72:C3:0D:94:1E:29:8B:45:F6:00:C7:3A:12";

const CHROME_OFFER = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=application 59341 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 203.0.113.7",
  "a=candidate:2971430341 1 udp 2113937151 6f1c8a3e-2b7d-4c55-9d0a-0e4b3f2a9c11.local 59341 typ host generation 0 network-cost 999",
  "a=candidate:2971430341 1 udp 2113937151 6f1c8a3e-2b7d-4c55-9d0a-0e4b3f2a9c11.local 59341 typ host generation 0 network-cost 999",
  "a=candidate:842163049 1 udp 1677729535 203.0.113.7 59341 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999",
  "a=candidate:3117245061 1 tcp 1518280447 192.168.1.20 9 typ host tcptype active generation 0",
  "a=ice-ufrag:Xf3k",
  "a=ice-pwd:q0Zt3nWm8VbR1yLp6sHc2dJa",
  "a=ice-options:trickle",
  `a=fingerprint:sha-256 ${FINGERPRINT}`,
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

describe("read_sdp", () => {
  test("keeps credentials, role, fingerprint and unique UDP candidates", () => {
    const signal = read_sdp(SignalKind.OFFER, CHROME_OFFER);
    expect(signal.ufrag).toBe("Xf3k");
    expect(signal.pwd).toBe("q0Zt3nWm8VbR1yLp6sHc2dJa");
    expect(signal.setup).toBe("actpass");
    expect(signal.fingerprint).toHaveLength(32);
    expect(signal.candidates).toEqual([
      { type: "host", address: "6f1c8a3e-2b7d-4c55-9d0a-0e4b3f2a9c11.local", port: 59341 },
      { type: "srflx", address: "203.0.113.7", port: 59341 },
    ]);
  });

  test("rejects an SDP without ICE credentials", () => {
    expect(() => read_sdp(SignalKind.OFFER, "v=0\r\n")).toThrow();
  });
});

describe("encode_signal / decode_signal", () => {
  test("round-trips", () => {
    const signal = read_sdp(SignalKind.ANSWER, CHROME_OFFER.replace("a=setup:actpass", "a=setup:active"));
    expect(decode_signal(encode_signal(signal))).toEqual(signal);
  });

  test("fits a version 5 QR code in alphanumeric mode", () => {
    const code = encode_signal(read_sdp(SignalKind.OFFER, CHROME_OFFER));
    expect(code).toMatch(/^[0-9A-Z $%*+\-./:]+$/);
    expect(encode(code, { ecc: "L" }).version).toBeLessThanOrEqual(5);
  });

  test("keeps non-base64 ICE credentials and odd addresses as text", () => {
    const signal = read_sdp(
      SignalKind.OFFER,
      CHROME_OFFER.replace("a=ice-ufrag:Xf3k", "a=ice-ufrag:a1b").replace("203.0.113.7 59341 typ srflx", "host.example 59341 typ srflx")
    );
    expect(decode_signal(encode_signal(signal))).toEqual(signal);
  });

  test("ignores line breaks from pasting", () => {
    const code = encode_signal(read_sdp(SignalKind.OFFER, CHROME_OFFER));
    expect(decode_signal(`${code.slice(0, 40)}\r\n${code.slice(40)}\n`)).toEqual(decode_signal(code));
  });

  test("keeps IPv6 addresses intact", () => {
    const signal = read_sdp(
      SignalKind.OFFER,
      CHROME_OFFER.replace("203.0.113.7 59341 typ srflx", "2001:db8::7 59341 typ srflx")
    );
    expect(decode_signal(encode_signal(signal)).candidates[1].address).toBe("2001:db8::7");
  });

  test("rejects a code from somewhere else", () => {
    expect(() => decode_signal("https://example.com")).toThrow("This isn't a P2P Transfer code");
    expect(() => decode_signal("HTTPS://EXAMPLE.COM")).toThrow("This isn't a P2P Transfer code");
  });
});

describe("write_sdp", () => {
  test("rebuilds an answer with the original fingerprint and candidates", () => {
    const signal = read_sdp(SignalKind.ANSWER, CHROME_OFFER.replace("a=setup:actpass", "a=setup:active"));
    const { type, sdp } = write_sdp(signal);
    expect(type).toBe("answer");
    expect(sdp).toContain(`a=fingerprint:sha-256 ${FINGERPRINT}`);
    expect(sdp).toContain("a=setup:active");
    expect(read_sdp(SignalKind.ANSWER, sdp!)).toEqual(signal);
  });
});

describe("parse_candidate", () => {
  test("skips TCP and RTCP candidates", () => {
    expect(parse_candidate("candidate:1 1 tcp 1 10.0.0.1 9 typ host tcptype active")).toBeNull();
    expect(parse_candidate("candidate:1 2 udp 1 10.0.0.1 5000 typ host")).toBeNull();
  });
});

describe("base45", () => {
  test("matches the RFC 9285 examples", () => {
    expect(to_base45(new TextEncoder().encode("AB"))).toBe("BB8");
    expect(to_base45(new TextEncoder().encode("Hello!!"))).toBe("%69 VD92EX0");
    expect(new TextDecoder().decode(from_base45("QED8WEX0"))).toBe("ietf!");
  });

  test("rejects invalid input", () => {
    expect(() => from_base45("GGW")).toThrow();
    expect(() => from_base45("abc")).toThrow();
  });
});
