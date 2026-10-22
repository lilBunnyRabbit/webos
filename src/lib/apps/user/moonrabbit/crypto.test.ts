import { describe, expect, it } from "vitest";
import {
  additional_data,
  create_header,
  DecryptError,
  decrypt_sealed,
  format_recovery_code,
  from_base64,
  Item,
  normalize_phrase,
  open,
  open_json,
  parse_recovery_code,
  PBKDF2_ITERATIONS,
  random_bytes,
  RECOVERY_BYTES,
  rewrap_phrase,
  rewrap_recovery,
  seal,
  seal_json,
  to_base64,
  unlock_with_phrase,
  unlock_with_recovery,
  verify_inbox_key,
  type JournalHeader,
} from "./crypto";

const FAST = 1_000;
const PHRASE = "acorn bubble cactus dagger eclipse";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function journal(phrase = PHRASE, iterations = FAST) {
  const recovery = random_bytes(RECOVERY_BYTES);
  const { header, key } = await create_header(phrase, recovery, { iterations });
  return { header, key, recovery };
}

describe("base64", () => {
  it("round-trips every byte value and large buffers", () => {
    const bytes = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(from_base64(to_base64(bytes))).toEqual(bytes);
  });
});

describe("create_header", () => {
  it("stores the iteration count, a salt, both wraps and an X25519 inbox key", async () => {
    const { header } = await journal();
    expect(header.version).toBe(1);
    expect(header.id).toMatch(/^[0-9a-f]{32}$/);
    expect(header.kdf.iterations).toBe(FAST);
    expect(from_base64(header.kdf.salt)).toHaveLength(16);
    expect(from_base64(header.inbox_public_key)).toHaveLength(32);
    expect(from_base64(header.wraps.phrase.iv)).toHaveLength(12);
  });

  it("defaults to 600,000 iterations", () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it("hands back a non-extractable data key", async () => {
    const { key } = await journal();
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("never puts the phrase or the recovery code in the header", async () => {
    const { header, recovery } = await journal();
    const text = JSON.stringify(header);
    expect(text).not.toContain("acorn");
    expect(text).not.toContain(to_base64(recovery));
  });
});

describe("unlock", () => {
  it("the phrase opens what the creation key sealed", async () => {
    const { header, key } = await journal();
    const aad = additional_data(header.id, Item.entry("a".repeat(32)));
    const sealed = await seal_json(key, aad, { body: "dear diary" });
    const unlocked = await unlock_with_phrase(header, PHRASE);
    expect(unlocked.extractable).toBe(false);
    expect(await open_json(unlocked, aad, sealed)).toEqual({ body: "dear diary" });
  });

  it("normalizes spacing and Unicode form in the phrase", async () => {
    const { header } = await journal("café crème");
    expect(normalize_phrase("  café   crème ")).toBe("café crème");
    await expect(unlock_with_phrase(header, "  café   crème ")).resolves.toBeDefined();
  });

  it("a wrong phrase fails", async () => {
    const { header } = await journal();
    await expect(unlock_with_phrase(header, "acorn bubble cactus dagger eclipsE")).rejects.toBeInstanceOf(DecryptError);
  });

  it("the recovery code opens the journal", async () => {
    const { header, key, recovery } = await journal();
    const aad = additional_data(header.id, Item.INDEX);
    const sealed = await seal(key, aad, encoder.encode("index"));
    const unlocked = await unlock_with_recovery(header, recovery);
    expect(decoder.decode(await open(unlocked, aad, sealed))).toBe("index");
  });

  it("a wrong recovery code fails", async () => {
    const { header } = await journal();
    await expect(unlock_with_recovery(header, random_bytes(RECOVERY_BYTES))).rejects.toBeInstanceOf(DecryptError);
  });

  it("honours the stored iteration count", async () => {
    const { header } = await journal(PHRASE, 1_234);
    await expect(unlock_with_phrase(header, PHRASE)).resolves.toBeDefined();
    await expect(unlock_with_phrase({ ...header, kdf: { ...header.kdf, iterations: 1_235 } }, PHRASE)).rejects.toBeInstanceOf(DecryptError);
  });

  it("a header from another journal can't open this one's wraps", async () => {
    const a = await journal();
    const b = await journal();
    const swapped: JournalHeader = { ...b.header, wraps: a.header.wraps, kdf: a.header.kdf };
    await expect(unlock_with_phrase(swapped, PHRASE)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe("seal and open", () => {
  it("rejects tampered ciphertext through the GCM tag", async () => {
    const { header, key } = await journal();
    const aad = additional_data(header.id, Item.entry("b".repeat(32)));
    const sealed = await seal(key, aad, encoder.encode("secret"));
    for (const at of [1, 13, sealed.length - 1]) {
      const tampered = sealed.slice();
      tampered[at] ^= 1;
      await expect(open(key, aad, tampered)).rejects.toBeInstanceOf(DecryptError);
    }
  });

  it("rejects a blob moved to another item or journal (additional data)", async () => {
    const { header, key } = await journal();
    const sealed = await seal(key, additional_data(header.id, Item.entry("c".repeat(32))), encoder.encode("secret"));
    await expect(open(key, additional_data(header.id, Item.entry("d".repeat(32))), sealed)).rejects.toBeInstanceOf(DecryptError);
    await expect(open(key, additional_data(header.id, Item.INDEX), sealed)).rejects.toBeInstanceOf(DecryptError);
    await expect(open(key, additional_data("e".repeat(32), Item.entry("c".repeat(32))), sealed)).rejects.toBeInstanceOf(DecryptError);
  });

  it("rejects an unknown format version byte", async () => {
    const { header, key } = await journal();
    const aad = additional_data(header.id, Item.INDEX);
    const sealed = await seal(key, aad, encoder.encode("x"));
    sealed[0] = 2;
    await expect(open(key, aad, sealed)).rejects.toThrow(/version/);
  });

  it("uses a fresh IV per write", async () => {
    const { header, key } = await journal();
    const aad = additional_data(header.id, Item.INDEX);
    const a = await seal(key, aad, encoder.encode("same"));
    const b = await seal(key, aad, encoder.encode("same"));
    expect(to_base64(a.slice(1, 13))).not.toBe(to_base64(b.slice(1, 13)));
  });

  it("another journal's key fails", async () => {
    const a = await journal();
    const b = await journal();
    const aad = additional_data(a.header.id, Item.INDEX);
    await expect(open(b.key, aad, await seal(a.key, aad, encoder.encode("x")))).rejects.toBeInstanceOf(DecryptError);
  });
});

describe("rewrapping", () => {
  it("a phrase change rewraps only the data key: old ciphertext opens with the new phrase, not the old", async () => {
    const { header, key } = await journal();
    const aad = additional_data(header.id, Item.INDEX);
    const sealed = await seal(key, aad, encoder.encode("kept"));
    const extractable = await unlock_with_phrase(header, PHRASE, true);
    const next = await rewrap_phrase(header, extractable, "new phrase for the moon", FAST);
    expect(next.kdf.salt).not.toBe(header.kdf.salt);
    expect(next.wraps.recovery).toEqual(header.wraps.recovery);
    expect(next.inbox_private_wrapped).toEqual(header.inbox_private_wrapped);
    expect(decoder.decode(await open(await unlock_with_phrase(next, "new phrase for the moon"), aad, sealed))).toBe("kept");
    await expect(unlock_with_phrase(next, PHRASE)).rejects.toBeInstanceOf(DecryptError);
  });

  it("raises the iteration count on a rewrap", async () => {
    const { header } = await journal(PHRASE, 1_000);
    const next = await rewrap_phrase(header, await unlock_with_phrase(header, PHRASE, true), PHRASE, 2_000);
    expect(next.kdf.iterations).toBe(2_000);
    await expect(unlock_with_phrase(next, PHRASE)).resolves.toBeDefined();
  });

  it("a non-extractable key can't be rewrapped", async () => {
    const { header, key } = await journal();
    await expect(rewrap_phrase(header, key, "other", FAST)).rejects.toThrow();
  });

  it("a new recovery code replaces the old one", async () => {
    const { header, recovery } = await journal();
    const code = random_bytes(RECOVERY_BYTES);
    const next = await rewrap_recovery(header, await unlock_with_phrase(header, PHRASE, true), code);
    await expect(unlock_with_recovery(next, code)).resolves.toBeDefined();
    await expect(unlock_with_recovery(next, recovery)).rejects.toBeInstanceOf(DecryptError);
  });
});

describe("inbox key", () => {
  it("the wrapped private key matches the public key", async () => {
    const { header, key } = await journal();
    expect(await verify_inbox_key(header, key)).toBe(true);
    const pkcs8 = await decrypt_sealed(key, additional_data(header.id, Item.INBOX_KEY), header.inbox_private_wrapped);
    expect(pkcs8.length).toBeGreaterThan(32);
  });

  it("a header pointing the inbox at another key fails the check", async () => {
    const a = await journal();
    const b = await journal();
    expect(await verify_inbox_key({ ...a.header, inbox_public_key: b.header.inbox_public_key }, a.key)).toBe(false);
  });
});

describe("recovery codes", () => {
  it("formats 128 bits as seven groups of four and parses them back", async () => {
    const bytes = random_bytes(RECOVERY_BYTES);
    const code = await format_recovery_code(bytes);
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(await parse_recovery_code(code)).toEqual(bytes);
    expect(await parse_recovery_code(code.toLowerCase().replace(/-/g, " "))).toEqual(bytes);
  });

  it("reads O as 0 and I or L as 1", async () => {
    const bytes = new Uint8Array(RECOVERY_BYTES);
    const code = await format_recovery_code(bytes);
    expect(await parse_recovery_code(code.replace(/0/g, "O"))).toEqual(bytes);
  });

  it("catches a typo through the checksum", async () => {
    const code = await format_recovery_code(random_bytes(RECOVERY_BYTES));
    const at = code.indexOf("-") - 1;
    const typo = code.slice(0, at) + (code[at] === "A" ? "B" : "A") + code.slice(at + 1);
    expect(await parse_recovery_code(typo)).toBeNull();
    expect(await parse_recovery_code(code.slice(0, -1))).toBeNull();
    expect(await parse_recovery_code(code.replace(/.$/, "U"))).toBeNull();
  });
});
