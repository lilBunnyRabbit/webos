import { additional_data, derive_hkdf_key, Item, unwrap_key, wrap_key, type Sealed } from "./crypto";

export const QuickMethod = { PASSKEY: "passkey", TAPS: "taps", PIN: "pin" } as const;
export type QuickMethod = (typeof QuickMethod)[keyof typeof QuickMethod];

export const MAX_ATTEMPTS = 5;
export const MASTER_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
export const QUICK_ITERATIONS = 600_000;
export const PIN_LENGTH = 6;
export const HOPS = 6;
export const MEADOW_COLUMNS = 4;
export const MEADOW_ROWS = 5;

/** The Carrot patch's 20 plots, in their unshuffled order. A hop is remembered by what grows there, not where. */
export const MEADOW = [
  "carrot",
  "clover",
  "flower",
  "tulip",
  "lotus",
  "leaf",
  "plant",
  "tree",
  "pine",
  "cactus",
  "acorn",
  "butterfly",
  "bug",
  "bird",
  "sun",
  "moon",
  "cloud",
  "drop",
  "egg",
  "feather",
] as const;
export type Plot = (typeof MEADOW)[number];

export interface QuickRecord {
  journal_id: string;
  method: QuickMethod;
  wrapped: Sealed;
  salt: string;
  iterations: number;
  credential_id?: string;
  shuffle?: boolean;
  attempts: number;
  master_at: number;
  /** `lastModified` of `journal.json` when this device last wrote or trusted it; a restore rewrites the file. */
  header_stamp: number;
}

export const QuickGate = { OPEN: "open", EXPIRED: "expired", RESTORED: "restored", LOCKED_OUT: "locked-out" } as const;
export type QuickGate = (typeof QuickGate)[keyof typeof QuickGate];

export function quick_gate(record: QuickRecord, header_stamp: number, now = Date.now()): QuickGate {
  if (record.attempts >= MAX_ATTEMPTS) return QuickGate.LOCKED_OUT;
  if (record.header_stamp !== header_stamp) return QuickGate.RESTORED;
  if (now - record.master_at > MASTER_EVERY_MS || now < record.master_at) return QuickGate.EXPIRED;
  return QuickGate.OPEN;
}

export function pin_secret(pin: string): string {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) throw new Error(`A PIN is ${PIN_LENGTH} digits`);
  return `pin:${pin}`;
}

export function taps_secret(hops: readonly string[]): string {
  if (hops.length !== HOPS || !hops.every((hop) => (MEADOW as readonly string[]).includes(hop))) throw new Error(`A path is ${HOPS} hops on the meadow`);
  return `taps:${hops.join(",")}`;
}

export function shuffled_meadow(random: () => number = Math.random): Plot[] {
  const plots: Plot[] = [...MEADOW];
  for (let i = plots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [plots[i], plots[j]] = [plots[j], plots[i]];
  }
  return plots;
}

/**
 * HMAC(device key, PBKDF2(secret)): the slow hash makes guessing cost, the device key (non-extractable, in IndexedDB)
 * makes a copy of the journal files alone useless for guessing a short PIN or path.
 */
export async function derive_quick_key(device_key: CryptoKey, secret: string, salt: Uint8Array<ArrayBuffer>, iterations = QUICK_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const stretched = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", device_key, stretched));
  try {
    return await derive_hkdf_key(mac, salt, "moonrabbit/quick");
  } finally {
    stretched.fill(0);
    mac.fill(0);
  }
}

export async function derive_passkey_key(prf: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return derive_hkdf_key(prf, salt, "moonrabbit/passkey");
}

export function generate_device_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]) as Promise<CryptoKey>;
}

export function wrap_quick(data_key: CryptoKey, kek: CryptoKey, journal_id: string, method: QuickMethod): Promise<Sealed> {
  return wrap_key(data_key, kek, additional_data(journal_id, Item.quick(method)));
}

export function unwrap_quick(record: QuickRecord, kek: CryptoKey): Promise<CryptoKey> {
  return unwrap_key(record.wrapped, kek, additional_data(record.journal_id, Item.quick(record.method)));
}
