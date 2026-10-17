export interface ConvertResult {
  ok: boolean;
  value: string;
  error?: string;
}

const CHUNK = 0x8000;

function bytes_to_binary(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return binary;
}

export function bytes_to_base64(bytes: Uint8Array, url_safe = false): string {
  const encoded = btoa(bytes_to_binary(bytes));
  return url_safe ? encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : encoded;
}

export function encode_base64(text: string, url_safe = false): string {
  return bytes_to_base64(new TextEncoder().encode(text), url_safe);
}

export function base64_to_bytes(input: string): Uint8Array<ArrayBuffer> | null {
  const compact = input.replace(/\s+/g, "").replaceAll("-", "+").replaceAll("_", "/");
  const body = compact.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || body.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(body.padEnd(Math.ceil(body.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function decode_base64(input: string): ConvertResult {
  const bytes = base64_to_bytes(input);
  if (!bytes) return { ok: false, value: "", error: "Not valid Base64" };
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, value: "", error: "The decoded bytes aren't UTF-8 text" };
  }
}
