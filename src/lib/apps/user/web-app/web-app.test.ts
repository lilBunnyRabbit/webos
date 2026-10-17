import { describe, expect, it } from "vitest";
import { favicon_url, file_name_for, is_own_origin, name_from_url, normalize_url, parse_web_app, serialize_web_app } from "./web-app";

describe("normalize_url", () => {
  it("adds https when no scheme is typed", () => {
    expect(normalize_url("  example.com/path ")).toBe("https://example.com/path");
  });

  it("keeps http and https", () => {
    expect(normalize_url("http://example.com")).toBe("http://example.com/");
    expect(normalize_url("https://localhost:5173")).toBe("https://localhost:5173/");
  });

  it("refuses other schemes, bare words and empty input", () => {
    expect(normalize_url("javascript:alert(1)")).toBeNull();
    expect(normalize_url("data:text/html,hi")).toBeNull();
    expect(normalize_url("ftp://example.com")).toBeNull();
    expect(normalize_url("hello")).toBeNull();
    expect(normalize_url("")).toBeNull();
  });
});

describe("name_from_url", () => {
  it("drops www and the last label", () => {
    expect(name_from_url("https://www.example.com/a")).toBe("Example");
    expect(name_from_url("https://docs.example.org")).toBe("Docs.example");
    expect(name_from_url("http://localhost:3000")).toBe("Localhost");
  });
});

describe("favicon_url", () => {
  it("uses the site's /favicon.ico unless the file names an icon", () => {
    expect(favicon_url({ url: "http://example.com/app/" })).toBe("http://example.com/favicon.ico");
    expect(favicon_url({ url: "https://example.com", icon: "https://cdn.example.com/i.png" })).toBe("https://cdn.example.com/i.png");
  });
});

describe("is_own_origin", () => {
  it("compares origins", () => {
    expect(is_own_origin("https://os.example.com/x", "https://os.example.com")).toBe(true);
    expect(is_own_origin("https://example.com", "https://os.example.com")).toBe(false);
  });
});

describe("file_name_for", () => {
  it("strips characters a file name can't hold", () => {
    expect(file_name_for("A/B: c")).toBe("A B c.webapp");
    expect(file_name_for("  ")).toBe("Web app.webapp");
  });
});

describe("parse_web_app", () => {
  it("round-trips", () => {
    const app = { name: "Example", url: "https://example.com/" };
    expect(parse_web_app(serialize_web_app(app))).toEqual(app);
  });

  it("rejects bad JSON, missing fields and non-web URLs", () => {
    expect(parse_web_app("{")).toBeNull();
    expect(parse_web_app(JSON.stringify({ name: "x" }))).toBeNull();
    expect(parse_web_app(JSON.stringify({ name: "x", url: "javascript:alert(1)" }))).toBeNull();
    expect(parse_web_app(JSON.stringify({ name: "x", url: "https://a.com", icon: "file:///etc" }))).toBeNull();
  });
});
