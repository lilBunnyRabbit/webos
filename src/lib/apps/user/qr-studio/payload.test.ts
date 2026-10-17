import { describe, expect, test } from "vitest";
import { encode_latin2, is_latin2 } from "./encode/segments";
import {
  content_payload,
  ContentKind,
  DEFAULT_CONTENT,
  email_payload,
  parse_amount,
  phone_payload,
  upn_payload,
  upn_problems,
  url_payload,
  vcard_payload,
  wifi_payload,
  WifiSecurity,
  type UpnContent,
} from "./payload";

describe("ISO 8859-2", () => {
  test("every byte from 0xA0 round-trips through the platform decoder", () => {
    const decoder = new TextDecoder("iso-8859-2");
    const bytes = Uint8Array.from({ length: 96 }, (_, i) => 0xa0 + i);
    const text = decoder.decode(bytes);
    expect(is_latin2(text)).toBe(true);
    expect([...encode_latin2(text)]).toEqual([...bytes]);
  });

  test("Slovenian letters", () => {
    expect([...encode_latin2("ČŠŽčšž")]).toEqual([0xc8, 0xa9, 0xae, 0xe8, 0xb9, 0xbe]);
    expect([...encode_latin2("€")]).toEqual([0x3f]);
  });
});

describe("payloads", () => {
  test("Wi-Fi escapes the special characters", () => {
    expect(wifi_payload({ ssid: 'My;Net,"x"', password: "p:a\\ss", security: WifiSecurity.WPA, hidden: true })).toBe(
      'WIFI:T:WPA;S:My\\;Net\\,\\"x\\";P:p\\:a\\\\ss;H:true;;'
    );
    expect(wifi_payload({ ssid: "Cafe", password: "ignored", security: WifiSecurity.NONE, hidden: false })).toBe("WIFI:T:nopass;S:Cafe;;");
  });

  test("vCard", () => {
    const card = vcard_payload({ ...DEFAULT_CONTENT.vcard, first: "Ana", last: "Novak", phone: "+386 40 123 456", org: "A, B" });
    expect(card.split("\r\n")).toEqual(["BEGIN:VCARD", "VERSION:3.0", "N:Novak;Ana;;;", "FN:Ana Novak", "ORG:A\\, B", "TEL;TYPE=CELL:+386 40 123 456", "END:VCARD"]);
  });

  test("email, phone and URL", () => {
    expect(email_payload({ to: "a@b.si", subject: "Hi there", body: "" })).toBe("mailto:a@b.si?subject=Hi%20there");
    expect(phone_payload("+386 (1) 234-56")).toBe("tel:+386123456");
    expect(url_payload("example.com")).toBe("https://example.com");
    expect(url_payload("mailto:x@y")).toBe("mailto:x@y");
  });

  test("amounts", () => {
    expect(parse_amount("12,5")).toBe(1250);
    expect(parse_amount("1.234,56")).toBe(123456);
    expect(parse_amount("99.99")).toBe(9999);
    expect(parse_amount("abc")).toBeNull();
  });
});

describe("UPN QR", () => {
  const upn: UpnContent = {
    payer_name: "Janez Novak",
    payer_street: "Dunajska 1",
    payer_city: "1000 Ljubljana",
    amount: "10,25",
    purpose_code: "othr",
    purpose: "Plačilo računa",
    due: "2026-11-01",
    iban: "SI56 0201 0001 2345 678",
    reference: "SI00 123-456",
    name: "Podjetje d.o.o.",
    street: "Šmartinska 2",
    city: "1000 Ljubljana",
  };

  test("fields, checksum and the closing reserve field", () => {
    const lines = upn_payload(upn).split("\n");
    expect(lines).toHaveLength(21);
    expect(lines.slice(0, 19)).toEqual([
      "UPNQR",
      "",
      "",
      "",
      "",
      "Janez Novak",
      "Dunajska 1",
      "1000 Ljubljana",
      "00000001025",
      "",
      "",
      "OTHR",
      "Plačilo računa",
      "01.11.2026",
      "SI56020100012345678",
      "SI00123-456",
      "Podjetje d.o.o.",
      "Šmartinska 2",
      "1000 Ljubljana",
    ]);
    const lengths = lines.slice(0, 19).reduce((sum, line) => sum + line.length, 0);
    expect(lines[19]).toBe(String(lengths + 19).padStart(3, "0"));
    expect(lines[20]).toBe("");
    expect(upn_problems(upn)).toEqual([]);
  });

  test("pins version 15 at ECC M in ISO 8859-2", () => {
    const payload = content_payload({ ...DEFAULT_CONTENT, kind: ContentKind.UPN, upn });
    expect(payload.fixed).toEqual({ ecc: "M", version: 15 });
    expect(payload.charset).toBe("iso-8859-2");
  });

  test("flags a bad IBAN and reference", () => {
    expect(upn_problems({ ...upn, iban: "DE12", reference: "12" })).toHaveLength(2);
  });
});
