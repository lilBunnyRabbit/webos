import { base64_to_bytes } from "./base64";
import { relative_time } from "./time";

export type Json = string | number | boolean | null | Json[] | JsonObject;
export interface JsonObject {
  [key: string]: Json;
}

export interface DecodedJwt {
  header: JsonObject;
  payload: JsonObject;
  signing_input: string;
  signature: Uint8Array<ArrayBuffer>;
}

export type JwtResult = { ok: true; jwt: DecodedJwt } | { ok: false; error: string };

const HMAC_HASHES: Record<string, string> = { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" };

export const TIME_CLAIMS = [
  { claim: "exp", label: "Expires" },
  { claim: "nbf", label: "Not before" },
  { claim: "iat", label: "Issued" },
] as const;

export const JwtState = {
  ACTIVE: "active",
  EXPIRED: "expired",
  NOT_YET: "not-yet",
  NO_EXPIRY: "no-expiry",
} as const;
export type JwtState = (typeof JwtState)[keyof typeof JwtState];

export interface JwtTime {
  claim: string;
  label: string;
  seconds: number;
  iso: string;
  relative: string;
}

export interface JwtStatus {
  state: JwtState;
  text: string;
}

function decode_part(part: string, name: string): JsonObject | string {
  const bytes = base64_to_bytes(part);
  if (!bytes) return `The ${name} isn't Base64url`;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return `The ${name} isn't JSON`;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return `The ${name} isn't a JSON object`;
  return parsed as JsonObject;
}

export function decode_jwt(token: string): JwtResult {
  const parts = token.trim().replace(/^Bearer\s+/i, "").split(".");
  if (parts.length !== 3) return { ok: false, error: "A JWT has three parts separated by dots" };
  const [header_part, payload_part, signature_part] = parts;
  const header = decode_part(header_part, "header");
  if (typeof header === "string") return { ok: false, error: header };
  const payload = decode_part(payload_part, "payload");
  if (typeof payload === "string") return { ok: false, error: payload };
  const signature = base64_to_bytes(signature_part);
  if (!signature) return { ok: false, error: "The signature isn't Base64url" };
  return { ok: true, jwt: { header, payload, signing_input: `${header_part}.${payload_part}`, signature } };
}

export function jwt_times(payload: JsonObject, now = Date.now()): JwtTime[] {
  return TIME_CLAIMS.flatMap(({ claim, label }) => {
    const seconds = payload[claim];
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return [];
    const ms = seconds * 1000;
    return [{ claim, label, seconds, iso: new Date(ms).toISOString(), relative: relative_time(ms, now) }];
  });
}

export function jwt_status(payload: JsonObject, now = Date.now()): JwtStatus {
  const { exp, nbf } = payload;
  if (typeof nbf === "number" && nbf * 1000 > now)
    return { state: JwtState.NOT_YET, text: `Valid ${relative_time(nbf * 1000, now)}` };
  if (typeof exp !== "number") return { state: JwtState.NO_EXPIRY, text: "Never expires" };
  return exp * 1000 <= now
    ? { state: JwtState.EXPIRED, text: `Expired ${relative_time(exp * 1000, now)}` }
    : { state: JwtState.ACTIVE, text: `Expires ${relative_time(exp * 1000, now)}` };
}

export function is_hmac(header: JsonObject): boolean {
  return typeof header.alg === "string" && header.alg in HMAC_HASHES;
}

/** `null` when the token isn't signed with HS256, HS384 or HS512. */
export async function verify_hmac(jwt: DecodedJwt, secret: string): Promise<boolean | null> {
  const hash = typeof jwt.header.alg === "string" ? HMAC_HASHES[jwt.header.alg] : undefined;
  if (!hash) return null;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, jwt.signature, encoder.encode(jwt.signing_input));
}
