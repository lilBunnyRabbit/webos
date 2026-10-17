import { describe, expect, test } from "vitest";
import { encode_base64 } from "./base64";
import { JwtState, decode_jwt, is_hmac, jwt_status, jwt_times, verify_hmac, type DecodedJwt } from "./jwt";

const JWT_IO =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

function decoded(token: string): DecodedJwt {
  const result = decode_jwt(token);
  if (!result.ok) throw new Error(result.error);
  return result.jwt;
}

async function sign(alg: string, payload: object, secret: string): Promise<string> {
  const signing_input = `${encode_base64(JSON.stringify({ alg, typ: "JWT" }), true)}.${encode_base64(JSON.stringify(payload), true)}`;
  const hash = { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" }[alg] ?? "SHA-256";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signing_input)));
  return `${signing_input}.${btoa(String.fromCharCode(...signature)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

describe("decode_jwt", () => {
  test("reads header and payload", () => {
    const jwt = decoded(JWT_IO);
    expect(jwt.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(jwt.payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(jwt.signature).toHaveLength(32);
  });

  test("takes a Bearer prefix and surrounding space", () => {
    expect(decode_jwt(`  Bearer ${JWT_IO}\n`).ok).toBe(true);
  });

  test("says which part is broken", () => {
    expect(decode_jwt("a.b")).toEqual({ ok: false, error: "A JWT has three parts separated by dots" });
    expect(decode_jwt(`*.${JWT_IO.split(".")[1]}.x`)).toEqual({ ok: false, error: "The header isn't Base64url" });
    expect(decode_jwt(`${encode_base64("[1]", true)}.e30.`)).toEqual({ ok: false, error: "The header isn't a JSON object" });
    expect(decode_jwt("e30.bm9wZQ.")).toEqual({ ok: false, error: "The payload isn't JSON" });
  });
});

describe("times and status", () => {
  const now = 1_700_000_000_000;

  test("humanises exp, nbf and iat", () => {
    const times = jwt_times({ iat: 1_699_996_400, exp: 1_700_003_600, name: "x" }, now);
    expect(times.map((time) => [time.claim, time.relative])).toEqual([
      ["exp", "in 1 hour"],
      ["iat", "1 hour ago"],
    ]);
    expect(times[0].iso).toBe("2023-11-14T23:13:20.000Z");
  });

  test("expired, not yet, active and never", () => {
    expect(jwt_status({ exp: 1_699_999_000 }, now).state).toBe(JwtState.EXPIRED);
    expect(jwt_status({ exp: 1_700_009_000, nbf: 1_700_000_600 }, now)).toEqual({
      state: JwtState.NOT_YET,
      text: "Valid in 10 minutes",
    });
    expect(jwt_status({ exp: 1_700_000_060 }, now)).toEqual({ state: JwtState.ACTIVE, text: "Expires in 1 minute" });
    expect(jwt_status({}, now).state).toBe(JwtState.NO_EXPIRY);
  });
});

describe("verify_hmac", () => {
  test("checks the jwt.io sample with its secret", async () => {
    expect(await verify_hmac(decoded(JWT_IO), "your-256-bit-secret")).toBe(true);
    expect(await verify_hmac(decoded(JWT_IO), "wrong")).toBe(false);
  });

  test.each(["HS256", "HS384", "HS512"])("verifies %s", async (alg) => {
    const jwt = decoded(await sign(alg, { sub: "rabbit" }, "s3cret"));
    expect(is_hmac(jwt.header)).toBe(true);
    expect(await verify_hmac(jwt, "s3cret")).toBe(true);
    expect(await verify_hmac(jwt, "s3cret!")).toBe(false);
  });

  test("gives null for algorithms it can't check with a secret", async () => {
    const jwt = decoded(`${encode_base64('{"alg":"RS256"}', true)}.e30.AA`);
    expect(is_hmac(jwt.header)).toBe(false);
    expect(await verify_hmac(jwt, "x")).toBeNull();
  });
});
