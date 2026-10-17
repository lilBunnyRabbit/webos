import { describe, expect, test } from "vitest";
import { parse_http, serialize_http, substitute, type HttpDocument } from "./http-file";

describe("parse_http", () => {
  test("reads requests separated by ### with names, headers and bodies", () => {
    const document = parse_http(
      [
        "### List users",
        "GET https://api.test/users HTTP/1.1",
        "Accept: application/json",
        "",
        "### Create",
        "POST https://api.test/users",
        "Content-Type: application/json",
        "",
        "{",
        '  "name": "Ana"',
        "}",
        "",
        "",
      ].join("\n")
    );
    expect(document.requests).toEqual([
      { name: "List users", method: "GET", url: "https://api.test/users", headers: [{ name: "Accept", value: "application/json" }], body: "" },
      {
        name: "Create",
        method: "POST",
        url: "https://api.test/users",
        headers: [{ name: "Content-Type", value: "application/json" }],
        body: '{\n  "name": "Ana"\n}',
      },
    ]);
  });

  test("a bare URL is a GET and the first request needs no separator", () => {
    expect(parse_http("https://example.com\n").requests).toEqual([
      { name: "", method: "GET", url: "https://example.com", headers: [], body: "" },
    ]);
  });

  test("takes # @name, skips comments and keeps file variables", () => {
    const document = parse_http("@host = https://api.test\n\n# @name ping\n// a comment\nGET {{host}}/ping\n# not a header\nX-A: 1\n");
    expect(document.variables).toEqual([{ name: "host", value: "https://api.test" }]);
    expect(document.requests[0]).toMatchObject({ name: "ping", url: "{{host}}/ping", headers: [{ name: "X-A", value: "1" }] });
  });

  test("joins query lines that follow the request line", () => {
    expect(parse_http("GET https://api.test/search\n  ?q=cats\n  &page=2\n").requests[0].url).toBe("https://api.test/search?q=cats&page=2");
  });

  test("handles CRLF and keeps blank lines inside a body", () => {
    expect(parse_http("POST https://a.test\r\n\r\nline 1\r\n\r\nline 3\r\n").requests[0].body).toBe("line 1\n\nline 3");
  });

  test("header values may contain colons", () => {
    expect(parse_http("GET https://a.test\nX-Time: 12:30:00\n").requests[0].headers).toEqual([{ name: "X-Time", value: "12:30:00" }]);
  });

  test("an empty or comment-only file has no requests", () => {
    expect(parse_http("").requests).toEqual([]);
    expect(parse_http("###\n# nothing here\n").requests).toEqual([]);
  });
});

describe("serialize_http", () => {
  const document: HttpDocument = {
    variables: [{ name: "token", value: "abc" }],
    requests: [
      { name: "Me", method: "GET", url: "https://api.test/me", headers: [{ name: "Authorization", value: "Bearer {{token}}" }], body: "" },
      { name: "", method: "PUT", url: "https://api.test/me", headers: [], body: "a=1\n\nb=2" },
    ],
  };

  test("writes the REST Client layout", () => {
    expect(serialize_http(document)).toBe(
      "@token = abc\n\n### Me\nGET https://api.test/me\nAuthorization: Bearer {{token}}\n\n###\nPUT https://api.test/me\n\na=1\n\nb=2\n"
    );
  });

  test("round-trips through parse_http", () => {
    expect(parse_http(serialize_http(document))).toEqual(document);
  });

  test("drops headers without a name", () => {
    const text = serialize_http({ variables: [], requests: [{ ...document.requests[1], headers: [{ name: " ", value: "x" }] }] });
    expect(text).not.toContain(": x");
  });
});

describe("substitute", () => {
  test("fills {{name}} and leaves unknown names", () => {
    expect(substitute("{{ host }}/a/{{missing}}", [{ name: "host", value: "https://x.test" }])).toBe("https://x.test/a/{{missing}}");
  });
});
