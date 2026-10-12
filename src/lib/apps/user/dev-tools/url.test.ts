import { describe, expect, test } from "vitest";
import { UrlScope, decode_url, encode_url, parse_url } from "./url";

describe("encode_url / decode_url", () => {
  test("component scope escapes URL syntax", () => {
    expect(encode_url("a b&c=d/é", UrlScope.COMPONENT).value).toBe("a%20b%26c%3Dd%2F%C3%A9");
  });

  test("uri scope keeps URL syntax", () => {
    expect(encode_url("https://x.dev/a b?q=é&r=1", UrlScope.URI).value).toBe("https://x.dev/a%20b?q=%C3%A9&r=1");
  });

  test("round trips", () => {
    const text = "q=🐰 & ž/?#";
    expect(decode_url(encode_url(text, UrlScope.COMPONENT).value, UrlScope.COMPONENT)).toEqual({ ok: true, value: text });
  });

  test("reports malformed escapes", () => {
    expect(decode_url("%E0%A4%A", UrlScope.COMPONENT).ok).toBe(false);
  });

  test("reports a lone surrogate", () => {
    expect(encode_url("\uD800", UrlScope.COMPONENT).ok).toBe(false);
  });
});

describe("parse_url", () => {
  test("lists the non-empty parts and every query parameter in order", () => {
    const parsed = parse_url("https://user:pw@example.com:8080/a/b?x=1&y=two&x=3#top");
    expect(parsed?.parts).toEqual([
      { label: "Protocol", value: "https:" },
      { label: "Username", value: "user" },
      { label: "Password", value: "pw" },
      { label: "Host", value: "example.com" },
      { label: "Port", value: "8080" },
      { label: "Path", value: "/a/b" },
      { label: "Query", value: "?x=1&y=two&x=3" },
      { label: "Fragment", value: "#top" },
      { label: "Origin", value: "https://example.com:8080" },
    ]);
    expect(parsed?.params).toEqual([
      ["x", "1"],
      ["y", "two"],
      ["x", "3"],
    ]);
  });

  test("decodes parameter values", () => {
    expect(parse_url("https://a.b/?q=a%20b+c")?.params).toEqual([["q", "a b c"]]);
  });

  test("returns null for a relative or broken URL", () => {
    expect(parse_url("/just/a/path")).toBeNull();
    expect(parse_url("not a url")).toBeNull();
  });
});
