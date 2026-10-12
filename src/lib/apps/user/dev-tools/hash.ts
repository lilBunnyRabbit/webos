export const HashAlgorithm = {
  SHA_1: "SHA-1",
  SHA_256: "SHA-256",
  SHA_384: "SHA-384",
  SHA_512: "SHA-512",
} as const;
export type HashAlgorithm = (typeof HashAlgorithm)[keyof typeof HashAlgorithm];

export const HASH_ALGORITHMS: HashAlgorithm[] = Object.values(HashAlgorithm);

export interface HashResult {
  algorithm: HashAlgorithm;
  hex: string;
}

export function to_hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function digest_all(data: string | BufferSource): Promise<HashResult[]> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return Promise.all(
    HASH_ALGORITHMS.map(async (algorithm) => ({ algorithm, hex: to_hex(await crypto.subtle.digest(algorithm, bytes)) }))
  );
}
