import { describe, expect, test } from "vitest";
import { empty_request } from "./http-file";
import {
  body_kind,
  BodyKind,
  download_name,
  explain_fetch_error,
  format_pairs,
  parse_header,
  parse_pairs,
  prepare,
  query_params,
  response_kind,
  ResponseKind,
  status_line,
  with_body_kind,
  with_query,
} from "./request";

describe("query params", () => {
  test("reads and rewrites the query, keeping the hash", () => {
    const url = "https://a.test/s?q=hello%20world&tag=a+b#top";
    expect(query_params(url)).toEqual([
      { name: "q", value: "hello world" },
      { name: "tag", value: "a b" },
    ]);
    expect(with_query(url, [{ name: "q", value: "x&y" }])).toBe("https://a.test/s?q=x%26y#top");
    expect(with_query(url, [])).toBe("https://a.test/s#top");
  });

  test("keeps malformed escapes as typed", () => {
    expect(parse_pairs("a=%E0%A4%A")).toEqual([{ name: "a", value: "%E0%A4%A" }]);
  });

  test("form bodies round-trip", () => {
    const pairs = [
      { name: "name", value: "Ana Novak" },
      { name: "note", value: "a=b&c" },
    ];
    expect(parse_pairs(format_pairs(pairs))).toEqual(pairs);
  });
});

describe("body kind", () => {
  test("follows Content-Type", () => {
    expect(body_kind({ headers: [], body: "" })).toBe(BodyKind.NONE);
    expect(body_kind({ headers: [], body: "hi" })).toBe(BodyKind.TEXT);
    expect(body_kind({ headers: [{ name: "content-type", value: "application/json; charset=utf-8" }], body: "" })).toBe(BodyKind.JSON);
    expect(body_kind({ headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }], body: "a=1" })).toBe(BodyKind.FORM);
  });

  test("switching sets one Content-Type, and none clears the body", () => {
    const request = { ...empty_request(), headers: [{ name: "content-type", value: "text/plain" }], body: "x" };
    const json = with_body_kind(request, BodyKind.JSON);
    expect(json.headers).toEqual([{ name: "Content-Type", value: "application/json" }]);
    expect(body_kind(json)).toBe(BodyKind.JSON);
    expect(with_body_kind(json, BodyKind.NONE)).toMatchObject({ headers: [], body: "" });
  });
});

describe("prepare", () => {
  test("substitutes variables, adds https:// and drops nameless headers", () => {
    const prepared = prepare(
      {
        ...empty_request(),
        method: "post",
        url: "{{host}}/items",
        headers: [
          { name: "X-Key", value: "{{key}}" },
          { name: "", value: "ignored" },
        ],
        body: '{"a":1}',
      },
      [
        { name: "host", value: "api.test" },
        { name: "key", value: "k1" },
      ]
    );
    expect(prepared).toEqual({
      url: "https://api.test/items",
      init: { method: "POST", headers: [["X-Key", "k1"]], body: '{"a":1}' },
    });
  });

  test("GET sends no body, and a missing URL is an error", () => {
    expect(prepare({ ...empty_request(), url: "https://a.test", body: "x" }).init.body).toBeUndefined();
    expect(() => prepare(empty_request())).toThrow("Enter a URL");
    expect(() => prepare({ ...empty_request(), url: "http://" })).toThrow("isn't a URL");
  });
});

describe("explain_fetch_error", () => {
  const error = new TypeError("Failed to fetch");
  test("names offline and mixed content, and otherwise says the browser won't tell", () => {
    expect(explain_fetch_error(error, "https://a.test", { online: false, protocol: "https:" }).title).toBe("You're offline");
    expect(explain_fetch_error(error, "http://a.test", { online: true, protocol: "https:" }).title).toContain("mixed content");
    expect(explain_fetch_error(error, "https://a.test", { online: true, protocol: "https:" }).detail).toContain("CORS");
    expect(explain_fetch_error(new Error("boom"), "https://a.test", { online: true, protocol: "https:" }).detail).toBe("boom");
  });
});

test("parse_header splits on the first colon", () => {
  expect(parse_header("Authorization: Bearer a:b")).toEqual({ name: "Authorization", value: "Bearer a:b" });
  expect(parse_header("nope")).toBeNull();
});

test("status_line fills the reason HTTP/2 leaves out", () => {
  expect(status_line(404, "")).toBe("404 Not Found");
  expect(status_line(299, "")).toBe("299");
  expect(status_line(200, "Fine")).toBe("200 Fine");
});

test("response_kind from Content-Type, sniffing untyped bodies", () => {
  const text = new TextEncoder().encode("hello");
  expect(response_kind("application/problem+json", text)).toBe(ResponseKind.JSON);
  expect(response_kind("image/png", text)).toBe(ResponseKind.IMAGE);
  expect(response_kind("application/xml", text)).toBe(ResponseKind.TEXT);
  expect(response_kind("", text)).toBe(ResponseKind.TEXT);
  expect(response_kind("", new Uint8Array([1, 0, 2]))).toBe(ResponseKind.BINARY);
  expect(response_kind("application/octet-stream", text)).toBe(ResponseKind.BINARY);
});

describe("download_name", () => {
  test("prefers Content-Disposition, extended form first", () => {
    expect(download_name("https://a.test/x", "attachment; filename=\"report.pdf\"", null)).toBe("report.pdf");
    expect(download_name("https://a.test/x", "attachment; filename=a.txt; filename*=UTF-8''%C4%8Drke.txt", null)).toBe("črke.txt");
  });

  test("falls back to the URL, then to download, adding an extension from the type", () => {
    expect(download_name("https://a.test/files/My%20Doc.txt?x=1", null, "text/plain")).toBe("My Doc.txt");
    expect(download_name("https://a.test/api/users", null, "application/json; charset=utf-8")).toBe("users.json");
    expect(download_name("https://a.test/", null, null)).toBe("download");
  });

  test("never lets a name leave its folder", () => {
    expect(download_name("https://a.test/", 'attachment; filename="../../etc/x"', null)).toBe(".._.._etc_x");
  });
});
