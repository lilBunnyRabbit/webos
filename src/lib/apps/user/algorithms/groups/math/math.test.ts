import { describe, expect, test } from "vitest";
import { default_params, record, type Definition } from "../../engine/definition";
import math, { crc32 } from "./index";

const run = <R>(id: string, input: unknown, params: Record<string, number | string> = {}) => {
  const definition = math[id] as Definition<unknown, R>;
  const recording = record(definition, input, { ...default_params(definition.params), ...params });
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

describe("math", () => {
  test("Euclid", () => {
    expect(run<{ gcd: number }>("euclid", [1071, 462]).gcd).toBe(21);
    for (let round = 0; round < 50; round++) {
      const [a, b] = [1 + Math.floor(Math.random() * 9999), 1 + Math.floor(Math.random() * 9999)];
      expect(run<{ gcd: number }>("euclid", [a, b]).gcd).toBe(gcd(a, b));
    }
  });

  test("sieve", () => {
    const { primes } = run<{ primes: number[] }>("sieve", [100]);
    expect(primes).toHaveLength(25);
    expect(primes.slice(0, 6)).toEqual([2, 3, 5, 7, 11, 13]);
    expect(primes.every((p) => Array.from({ length: p - 2 }, (_, i) => i + 2).every((d) => p % d !== 0))).toBe(true);
  });

  test("fast exponentiation matches BigInt", () => {
    for (let round = 0; round < 50; round++) {
      const [b, e, m] = [1 + Math.floor(Math.random() * 999), 1 + Math.floor(Math.random() * 99999), 2 + Math.floor(Math.random() * 99999)];
      expect(run<{ result: number }>("fast-power", [b, e, m]).result).toBe(Number(BigInt(b) ** BigInt(e) % BigInt(m)));
    }
  });

  test("Fisher–Yates returns a permutation, the same for the same seed", () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = run<{ shuffled: number[] }>("fisher-yates", input, { seed: 3 }).shuffled;
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    expect(run<{ shuffled: number[] }>("fisher-yates", input, { seed: 3 }).shuffled).toEqual(a);
    expect(run<{ shuffled: number[] }>("fisher-yates", input, { seed: 4 }).shuffled).not.toEqual(a);
  });

  test("reservoir keeps k items from the stream", () => {
    const stream = Array.from({ length: 30 }, (_, i) => i * 3);
    for (const k of [1, 3, 6]) {
      const { kept } = run<{ kept: number[] }>("reservoir-sampling", stream, { k, seed: 11 });
      expect(kept).toHaveLength(k);
      expect(new Set(kept).size).toBe(k);
      for (const value of kept) expect(stream).toContain(value);
    }
  });

  test("reservoir is roughly uniform over many seeds", () => {
    const stream = Array.from({ length: 10 }, (_, i) => i);
    const counts = new Array(10).fill(0);
    for (let seed = 0; seed < 400; seed++) for (const value of run<{ kept: number[] }>("reservoir-sampling", stream, { k: 2, seed }).kept) counts[value]++;
    for (const count of counts) expect(count).toBeGreaterThan(40);
  });

  test("CRC32 check value", () => {
    expect(crc32("123456789").toString(16)).toBe("cbf43926");
    expect(run<{ crc: number }>("crc32", "123456789").crc).toBe(0xcbf43926);
    expect(run<{ crc: number }>("crc32", "a").crc).toBe(0xe8b7be43);
  });

  for (const [id, definition] of Object.entries(math)) {
    test(`${id}: samples and random inputs run`, () => {
      for (const input of [definition.input.sample, ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
