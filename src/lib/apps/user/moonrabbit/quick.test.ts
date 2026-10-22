import { describe, expect, it } from "vitest";
import { create_header, DecryptError, random_bytes, RECOVERY_BYTES, to_base64, unlock_with_phrase } from "./crypto";
import {
  derive_passkey_key,
  derive_quick_key,
  generate_device_key,
  HOPS,
  MASTER_EVERY_MS,
  MAX_ATTEMPTS,
  MEADOW,
  MEADOW_COLUMNS,
  MEADOW_ROWS,
  pin_secret,
  quick_gate,
  QuickGate,
  QuickMethod,
  shuffled_meadow,
  taps_secret,
  unwrap_quick,
  wrap_quick,
  type QuickRecord,
} from "./quick";

const FAST = 1_000;

async function setup(method: QuickMethod, secret: string) {
  const { header } = await create_header("moon rabbit phrase here", random_bytes(RECOVERY_BYTES), { iterations: FAST });
  const device_key = await generate_device_key();
  const salt = random_bytes(16);
  const kek = await derive_quick_key(device_key, secret, salt, FAST);
  const record: QuickRecord = {
    journal_id: header.id,
    method,
    wrapped: await wrap_quick(await unlock_with_phrase(header, "moon rabbit phrase here", true), kek, header.id, method),
    salt: to_base64(salt),
    iterations: FAST,
    attempts: 0,
    master_at: Date.now(),
    header_stamp: 1,
  };
  return { header, device_key, salt, record };
}

describe("quick unlock", () => {
  it("the meadow has 20 distinct plots on a 4×5 grid", () => {
    expect(MEADOW).toHaveLength(MEADOW_COLUMNS * MEADOW_ROWS);
    expect(new Set(MEADOW).size).toBe(MEADOW.length);
  });

  it("a shuffle keeps every plot once", () => {
    const shuffled = shuffled_meadow();
    expect([...shuffled].sort()).toEqual([...MEADOW].sort());
  });

  it("a PIN or path unwraps a non-extractable data key; a wrong one fails", async () => {
    const { device_key, salt, record } = await setup(QuickMethod.PIN, pin_secret("123456"));
    const key = await unwrap_quick(record, await derive_quick_key(device_key, pin_secret("123456"), salt, FAST));
    expect(key.extractable).toBe(false);
    await expect(unwrap_quick(record, await derive_quick_key(device_key, pin_secret("123457"), salt, FAST))).rejects.toBeInstanceOf(DecryptError);
  });

  it("the device key is part of the secret: the same PIN with another device key fails", async () => {
    const { salt, record } = await setup(QuickMethod.PIN, pin_secret("000000"));
    const other = await generate_device_key();
    expect(other.extractable).toBe(false);
    await expect(unwrap_quick(record, await derive_quick_key(other, pin_secret("000000"), salt, FAST))).rejects.toBeInstanceOf(DecryptError);
  });

  it("a wrap made for one method doesn't open as another", async () => {
    const hops = MEADOW.slice(0, HOPS);
    const { device_key, salt, record } = await setup(QuickMethod.TAPS, taps_secret(hops));
    const kek = await derive_quick_key(device_key, taps_secret(hops), salt, FAST);
    await expect(unwrap_quick({ ...record, method: QuickMethod.PIN }, kek)).rejects.toBeInstanceOf(DecryptError);
    await expect(unwrap_quick(record, kek)).resolves.toBeDefined();
  });

  it("a passkey PRF output derives a working key; another output doesn't", async () => {
    const { header } = await create_header("moon rabbit phrase here", random_bytes(RECOVERY_BYTES), { iterations: FAST });
    const prf = random_bytes(32);
    const salt = random_bytes(32);
    const wrapped = await wrap_quick(await unlock_with_phrase(header, "moon rabbit phrase here", true), await derive_passkey_key(prf, salt), header.id, QuickMethod.PASSKEY);
    const record: QuickRecord = { journal_id: header.id, method: QuickMethod.PASSKEY, wrapped, salt: to_base64(salt), iterations: 0, attempts: 0, master_at: 0, header_stamp: 0 };
    await expect(unwrap_quick(record, await derive_passkey_key(prf, salt))).resolves.toBeDefined();
    await expect(unwrap_quick(record, await derive_passkey_key(random_bytes(32), salt))).rejects.toBeInstanceOf(DecryptError);
  });

  it("validates the inputs", () => {
    expect(() => pin_secret("12345")).toThrow();
    expect(() => pin_secret("12345a")).toThrow();
    expect(() => taps_secret(["carrot"])).toThrow();
    expect(() => taps_secret(["carrot", "carrot", "carrot", "carrot", "carrot", "wolf"])).toThrow();
    expect(taps_secret(["carrot", "carrot", "moon", "sun", "egg", "egg"])).toBe("taps:carrot,carrot,moon,sun,egg,egg");
  });
});

describe("quick_gate", () => {
  const base: QuickRecord = {
    journal_id: "a".repeat(32),
    method: QuickMethod.PIN,
    wrapped: { iv: "a", data: "b" },
    salt: "c",
    iterations: FAST,
    attempts: 0,
    master_at: 1_000_000,
    header_stamp: 42,
  };

  it("opens within seven days of the master phrase on an unchanged header", () => {
    expect(quick_gate(base, 42, base.master_at + MASTER_EVERY_MS - 1)).toBe(QuickGate.OPEN);
  });

  it("asks for the master phrase after seven days, or if the clock went back", () => {
    expect(quick_gate(base, 42, base.master_at + MASTER_EVERY_MS + 1)).toBe(QuickGate.EXPIRED);
    expect(quick_gate(base, 42, base.master_at - 1)).toBe(QuickGate.EXPIRED);
  });

  it("asks for it after a restore rewrote journal.json", () => {
    expect(quick_gate(base, 43, base.master_at + 1)).toBe(QuickGate.RESTORED);
  });

  it("is locked out after five wrong tries", () => {
    expect(quick_gate({ ...base, attempts: MAX_ATTEMPTS - 1 }, 42, base.master_at)).toBe(QuickGate.OPEN);
    expect(quick_gate({ ...base, attempts: MAX_ATTEMPTS }, 42, base.master_at)).toBe(QuickGate.LOCKED_OUT);
  });
});
