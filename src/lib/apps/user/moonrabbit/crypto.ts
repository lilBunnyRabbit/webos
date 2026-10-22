export const FORMAT_VERSION = 1;
/** OWASP's figure for PBKDF2-HMAC-SHA256 (2023). Stored per journal, so it can rise. */
export const PBKDF2_ITERATIONS = 600_000;
export const RECOVERY_BYTES = 16;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Sealed {
  iv: string;
  data: string;
}

/** Wrong secret, wrong item or tampered bytes: AES-GCM can't tell them apart, and neither do we. */
export class DecryptError extends Error {
  constructor(message = "This doesn't open the journal") {
    super(message);
    this.name = "DecryptError";
  }
}

export function random_bytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function to_base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export function from_base64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function from_base64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return from_base64(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

export function random_id(): string {
  return Array.from(random_bytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** What each ciphertext is bound to, so a blob moved to another item, journal or format version fails its tag. */
export const Item = {
  PHRASE: "wrap/phrase",
  RECOVERY: "wrap/recovery",
  INBOX_KEY: "inbox-key",
  INDEX: "index",
  entry: (id: string) => `entry/${id}`,
  media: (id: string) => `media/${id}`,
  quick: (method: string) => `wrap/quick/${method}`,
  inbox: (id: string) => `inbox/${id}`,
} as const;

export function additional_data(journal_id: string, item: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`moonrabbit/${FORMAT_VERSION}/${journal_id}/${item}`);
}

/** NFKC so the same phrase typed on another keyboard or OS derives the same key; outer and repeated spaces don't count. */
export function normalize_phrase(phrase: string): string {
  return phrase.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function generate_data_key(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function lock_down(key: CryptoKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  try {
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

export async function derive_phrase_key(
  phrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(normalize_phrase(phrase)), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

export async function derive_hkdf_key(
  input: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: string
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", input, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

export function derive_recovery_key(code: Uint8Array<ArrayBuffer>, journal_id: string): Promise<CryptoKey> {
  return derive_hkdf_key(code, encoder.encode(journal_id), "moonrabbit/recovery");
}

export async function wrap_key(key: CryptoKey, kek: CryptoKey, aad: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = random_bytes(IV_BYTES);
  const data = await crypto.subtle.wrapKey("raw", key, kek, { name: "AES-GCM", iv, additionalData: aad });
  return { iv: to_base64(iv), data: to_base64(new Uint8Array(data)) };
}

/** `extractable` only for a moment of rewrapping (phrase change, recovery code, quick unlock); never kept. */
export async function unwrap_key(
  sealed: Sealed,
  kek: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  extractable = false
): Promise<CryptoKey> {
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      from_base64(sealed.data),
      kek,
      { name: "AES-GCM", iv: from_base64(sealed.iv), additionalData: aad },
      { name: "AES-GCM" },
      extractable,
      ["encrypt", "decrypt"]
    );
  } catch {
    throw new DecryptError();
  }
}

export async function encrypt_sealed(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  plain: Uint8Array<ArrayBuffer>
): Promise<Sealed> {
  const iv = random_bytes(IV_BYTES);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plain);
  return { iv: to_base64(iv), data: to_base64(new Uint8Array(data)) };
}

export async function decrypt_sealed(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  sealed: Sealed
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: from_base64(sealed.iv), additionalData: aad },
        key,
        from_base64(sealed.data)
      )
    );
  } catch {
    throw new DecryptError();
  }
}

export async function seal(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  plain: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = random_bytes(IV_BYTES);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, plain));
  const out = new Uint8Array(1 + IV_BYTES + cipher.length);
  out[0] = FORMAT_VERSION;
  out.set(iv, 1);
  out.set(cipher, 1 + IV_BYTES);
  return out;
}

export async function open(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  sealed: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  if (sealed.length < 1 + IV_BYTES + 16 || sealed[0] !== FORMAT_VERSION)
    throw new DecryptError("This file isn't a Moonrabbit file this version can read");
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: sealed.slice(1, 1 + IV_BYTES), additionalData: aad },
        key,
        sealed.slice(1 + IV_BYTES)
      )
    );
  } catch {
    throw new DecryptError();
  }
}

export function seal_json(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  value: unknown
): Promise<Uint8Array<ArrayBuffer>> {
  return seal(key, aad, encoder.encode(JSON.stringify(value)));
}

export async function open_json(
  key: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
  sealed: Uint8Array<ArrayBuffer>
): Promise<unknown> {
  return JSON.parse(decoder.decode(await open(key, aad, sealed)));
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK_BITS = 12;

function bits_of(bytes: Uint8Array, count = bytes.length * 8): number[] {
  const bits: number[] = [];
  for (let i = 0; i < count; i++) bits.push((bytes[i >> 3] >> (7 - (i & 7))) & 1);
  return bits;
}

async function checksum_bits(bytes: Uint8Array<ArrayBuffer>): Promise<number[]> {
  return bits_of(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), CHECK_BITS);
}

/**
 * 128 random bits plus a 12-bit checksum, as 28 Crockford base32 characters in seven groups of four. The checksum
 * catches a typo before it reads as "wrong code".
 */
export async function format_recovery_code(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (bytes.length !== RECOVERY_BYTES) throw new Error("A recovery code is 16 bytes");
  const bits = [...bits_of(bytes), ...(await checksum_bits(bytes))];
  let text = "";
  for (let i = 0; i < bits.length; i += 5)
    text += CROCKFORD[bits.slice(i, i + 5).reduce((value, bit) => (value << 1) | bit, 0)];
  return text.match(/.{4}/g)!.join("-");
}

/** The code as typed, any case, with or without dashes and spaces; Crockford's look-alikes (O, I, L) count. `null` on a typo. */
export async function parse_recovery_code(text: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const clean = text.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (clean.length !== 28) return null;
  const bits: number[] = [];
  for (const char of clean) {
    const value = CROCKFORD.indexOf(char);
    if (value < 0) return null;
    for (let i = 4; i >= 0; i--) bits.push((value >> i) & 1);
  }
  const bytes = new Uint8Array(RECOVERY_BYTES);
  for (let i = 0; i < RECOVERY_BYTES * 8; i++) bytes[i >> 3] |= bits[i] << (7 - (i & 7));
  const check = await checksum_bits(bytes);
  return check.every((bit, i) => bit === bits[RECOVERY_BYTES * 8 + i]) ? bytes : null;
}

export interface JournalHeader {
  version: number;
  id: string;
  kdf: { iterations: number; salt: string };
  wraps: { phrase: Sealed; recovery: Sealed };
  inbox_public_key: string;
  inbox_private_wrapped: Sealed;
}

export interface CreateOptions {
  iterations?: number;
}

export async function create_header(
  phrase: string,
  recovery: Uint8Array<ArrayBuffer>,
  options: CreateOptions = {}
): Promise<{ header: JournalHeader; key: CryptoKey }> {
  const id = random_id();
  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = random_bytes(SALT_BYTES);
  const data_key = await generate_data_key();
  const inbox = (await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"])) as CryptoKeyPair;
  const private_key = new Uint8Array(await crypto.subtle.exportKey("pkcs8", inbox.privateKey));
  try {
    const header: JournalHeader = {
      version: FORMAT_VERSION,
      id,
      kdf: { iterations, salt: to_base64(salt) },
      wraps: {
        phrase: await wrap_key(
          data_key,
          await derive_phrase_key(phrase, salt, iterations),
          additional_data(id, Item.PHRASE)
        ),
        recovery: await wrap_key(data_key, await derive_recovery_key(recovery, id), additional_data(id, Item.RECOVERY)),
      },
      inbox_public_key: to_base64(new Uint8Array(await crypto.subtle.exportKey("raw", inbox.publicKey))),
      inbox_private_wrapped: await encrypt_sealed(data_key, additional_data(id, Item.INBOX_KEY), private_key),
    };
    return { header, key: await lock_down(data_key) };
  } finally {
    private_key.fill(0);
  }
}

export async function unlock_with_phrase(
  header: JournalHeader,
  phrase: string,
  extractable = false
): Promise<CryptoKey> {
  const kek = await derive_phrase_key(phrase, from_base64(header.kdf.salt), header.kdf.iterations);
  return unwrap_key(header.wraps.phrase, kek, additional_data(header.id, Item.PHRASE), extractable);
}

export async function unlock_with_recovery(
  header: JournalHeader,
  code: Uint8Array<ArrayBuffer>,
  extractable = false
): Promise<CryptoKey> {
  return unwrap_key(
    header.wraps.recovery,
    await derive_recovery_key(code, header.id),
    additional_data(header.id, Item.RECOVERY),
    extractable
  );
}

export async function rewrap_phrase(
  header: JournalHeader,
  data_key: CryptoKey,
  phrase: string,
  iterations = PBKDF2_ITERATIONS
): Promise<JournalHeader> {
  const salt = random_bytes(SALT_BYTES);
  const kek = await derive_phrase_key(phrase, salt, iterations);
  return {
    ...header,
    kdf: { iterations, salt: to_base64(salt) },
    wraps: { ...header.wraps, phrase: await wrap_key(data_key, kek, additional_data(header.id, Item.PHRASE)) },
  };
}

export async function rewrap_recovery(
  header: JournalHeader,
  data_key: CryptoKey,
  code: Uint8Array<ArrayBuffer>
): Promise<JournalHeader> {
  const kek = await derive_recovery_key(code, header.id);
  return {
    ...header,
    wraps: { ...header.wraps, recovery: await wrap_key(data_key, kek, additional_data(header.id, Item.RECOVERY)) },
  };
}

/**
 * The inbox private key decrypts and belongs to the public key in the header. A header edited to point the inbox at
 * someone else's key fails here.
 */
export async function verify_inbox_key(header: JournalHeader, key: CryptoKey): Promise<boolean> {
  const pkcs8 = await decrypt_sealed(key, additional_data(header.id, Item.INBOX_KEY), header.inbox_private_wrapped);
  try {
    const private_key = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "X25519" }, true, ["deriveBits"]);
    const jwk = await crypto.subtle.exportKey("jwk", private_key);
    const expected = from_base64(header.inbox_public_key);
    const actual = from_base64url(jwk.x ?? "");
    return expected.length === actual.length && expected.every((byte, i) => byte === actual[i]);
  } finally {
    pkcs8.fill(0);
  }
}

const X25519_BYTES = 32;

async function inbox_cipher_key(shared: ArrayBuffer, ephemeral: Uint8Array, recipient: Uint8Array): Promise<CryptoKey> {
  const salt = new Uint8Array(ephemeral.length + recipient.length);
  salt.set(ephemeral);
  salt.set(recipient, ephemeral.length);
  const base = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("moonrabbit/inbox") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Adding while locked needs only the header's public key, so nothing secret is typed. A fresh X25519 pair per item,
 * HKDF over the shared secret. Layout: version byte, ephemeral public key, IV, ciphertext and tag.
 */
export async function seal_inbox(
  header: JournalHeader,
  id: string,
  plain: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const recipient_raw = from_base64(header.inbox_public_key);
  const recipient = await crypto.subtle.importKey("raw", recipient_raw, { name: "X25519" }, false, []);
  const ephemeral = (await crypto.subtle.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair;
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: recipient }, ephemeral.privateKey, 256);
  const ephemeral_raw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const key = await inbox_cipher_key(shared, ephemeral_raw, recipient_raw);
  const iv = random_bytes(IV_BYTES);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: additional_data(header.id, Item.inbox(id)) },
      key,
      plain
    )
  );
  const out = new Uint8Array(1 + X25519_BYTES + IV_BYTES + cipher.length);
  out[0] = FORMAT_VERSION;
  out.set(ephemeral_raw, 1);
  out.set(iv, 1 + X25519_BYTES);
  out.set(cipher, 1 + X25519_BYTES + IV_BYTES);
  return out;
}

export async function inbox_private_key(header: JournalHeader, data_key: CryptoKey): Promise<CryptoKey> {
  const pkcs8 = await decrypt_sealed(
    data_key,
    additional_data(header.id, Item.INBOX_KEY),
    header.inbox_private_wrapped
  );
  try {
    return await crypto.subtle.importKey("pkcs8", pkcs8, { name: "X25519" }, false, ["deriveBits"]);
  } finally {
    pkcs8.fill(0);
  }
}

export async function open_inbox(
  header: JournalHeader,
  private_key: CryptoKey,
  id: string,
  sealed: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const head = 1 + X25519_BYTES + IV_BYTES;
  if (sealed.length < head + 16 || sealed[0] !== FORMAT_VERSION)
    throw new DecryptError("This isn't an inbox item this version can read");
  try {
    const ephemeral_raw = sealed.slice(1, 1 + X25519_BYTES);
    const ephemeral = await crypto.subtle.importKey("raw", ephemeral_raw, { name: "X25519" }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: "X25519", public: ephemeral }, private_key, 256);
    const key = await inbox_cipher_key(shared, ephemeral_raw, from_base64(header.inbox_public_key));
    const iv = sealed.slice(1 + X25519_BYTES, head);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: additional_data(header.id, Item.inbox(id)) },
        key,
        sealed.slice(head)
      )
    );
  } catch {
    throw new DecryptError();
  }
}
