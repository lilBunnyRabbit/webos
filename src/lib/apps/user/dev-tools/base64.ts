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

export function encode_base64(text: string, url_safe = false): string {
  const encoded = btoa(bytes_to_binary(new TextEncoder().encode(text)));
  return url_safe ? encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : encoded;
}

export function decode_base64(input: string): ConvertResult {
  const compact = input.replace(/\s+/g, "").replaceAll("-", "+").replaceAll("_", "/");
  const body = compact.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || body.length % 4 === 1) {
    return { ok: false, value: "", error: "Not valid Base64" };
  }

  let binary: string;
  try {
    binary = atob(body.padEnd(Math.ceil(body.length / 4) * 4, "="));
  } catch {
    return { ok: false, value: "", error: "Not valid Base64" };
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, value: "", error: "The decoded bytes aren't UTF-8 text" };
  }
}
