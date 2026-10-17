import { describe, expect, it } from "vitest";
import { chunk, classify_failure, classify_status, Gw2ErrorKind, looks_like_key, missing_scopes, request_url, Scope } from "./api";

const KEY = "564F181A-F0FC-114A-A55D-3C1DCD45F3767AF3848F-AB29-4EBF-9594-F91E6A75E015";

describe("classify_status", () => {
  it("tells a missing permission from a bad key", () => {
    expect(classify_status(401, "Invalid access token").kind).toBe(Gw2ErrorKind.INVALID_KEY);
    const scope = classify_status(403, "requires scope inventories");
    expect(scope.kind).toBe(Gw2ErrorKind.MISSING_SCOPE);
    expect(scope.message).toContain("inventories");
  });

  it("names rate limits, outages and missing things", () => {
    expect(classify_status(429, "too many requests").kind).toBe(Gw2ErrorKind.RATE_LIMIT);
    expect(classify_status(503, "API not active").kind).toBe(Gw2ErrorKind.UNAVAILABLE);
    expect(classify_status(404, "all ids provided are invalid").kind).toBe(Gw2ErrorKind.NOT_FOUND);
    expect(classify_status(400, "").message).toBe("The API answered 400.");
  });

  it("calls a failed fetch offline only when the browser is", () => {
    expect(classify_failure(false).kind).toBe(Gw2ErrorKind.OFFLINE);
    expect(classify_failure(true).kind).toBe(Gw2ErrorKind.FAILED);
  });
});

it("puts the key in the query", () => {
  expect(request_url("/account/wallet", { v: "latest" }, "abc")).toBe(
    "https://api.guildwars2.com/v2/account/wallet?v=latest&access_token=abc"
  );
  expect(request_url("/currencies", { ids: "all" })).toBe("https://api.guildwars2.com/v2/currencies?ids=all");
});

it("splits ids into bulk requests of 200", () => {
  const parts = chunk(Array.from({ length: 450 }, (_, index) => index));
  expect(parts.map((part) => part.length)).toEqual([200, 200, 50]);
});

it("recognises the shape of an API key", () => {
  expect(looks_like_key(KEY)).toBe(true);
  expect(looks_like_key(` ${KEY.toLowerCase()} `)).toBe(true);
  expect(looks_like_key(KEY.slice(1))).toBe(false);
  expect(looks_like_key("hello")).toBe(false);
});

it("lists the scopes a key lacks", () => {
  expect(missing_scopes(["account", "wallet"], [Scope.WALLET, Scope.INVENTORIES])).toEqual([Scope.INVENTORIES]);
});
