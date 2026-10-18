import { define, type Definition } from "../../engine/definition";
import { numbers, text } from "../../engine/inputs";
import { seeded } from "../../engine/seeded";
import { cells, grid, range_tones, Tone, type Cell, type Step, type View } from "../../engine/step";

const euclid = define({
  intro:
    "The greatest common divisor of a and b also divides a mod b, the remainder after dividing. So replace (a, b) with (b, a mod b) until the remainder is 0; the last non-zero number is the GCD. The numbers shrink at least as fast as the Fibonacci numbers grow, so it takes O(log min(a, b)) steps.",
  use: "Reducing fractions, modular inverses for RSA, simplifying ratios, and checking whether two numbers share a factor.",
  traits: ["O(log n)", "One of the oldest algorithms (≈300 BC)"],
  pseudocode: ["while b ≠ 0:", "  r ← a mod b", "  a ← b; b ← r", "return a"],
  input: numbers({ sample: [1071, 462], min_count: 2, max_count: 2, min: 1, max: 999999, hint: "Two whole numbers, like 1071 462", random_count: 2 }),
  *run([first, second]: number[]): Generator<Step, { gcd: number }> {
    let a = first;
    let b = second;
    const rows: (string | number)[][] = [];
    const view = (active = -1): View => grid({ title: "steps", col_labels: ["a", "b", "a mod b"], rows: rows.map((row, i) => cells(row, i === active ? { 0: Tone.COMPARE, 1: Tone.COMPARE, 2: Tone.WARN } : {})) });
    yield { views: [view()], line: 0, note: `gcd(${a}, ${b}).`, counters: { steps: 0 } };
    while (b !== 0) {
      const r = a % b;
      rows.push([a, b, r]);
      yield { views: [view(rows.length - 1)], line: 1, note: `${a} = ${Math.floor(a / b)} × ${b} + ${r}: the remainder is ${r}.`, counters: { steps: rows.length } };
      [a, b] = [b, r];
    }
    rows.push([a, 0, "–"]);
    yield { views: [view(), { kind: "text", title: "gcd", lines: [{ text: String(a), tone: Tone.DONE }] }], line: 3, note: `The remainder hit 0: gcd(${first}, ${second}) = ${a}.`, counters: { steps: rows.length - 1 } };
    return { gcd: a };
  },
});

const sieve = define({
  intro:
    "To find every prime up to n, start with all numbers marked as possible primes. Take the smallest unmarked number p: it's prime, so cross out p², p² + p, p² + 2p, … (smaller multiples were already crossed out by smaller primes). Stop once p² passes n. What's left is prime.",
  use: "Generating prime tables for number theory, cryptography tests and puzzles; the segmented version scales to billions.",
  traits: ["O(n log log n)", "Crosses out multiples"],
  pseudocode: ["mark 2..n as possibly prime", "for p from 2 while p² ≤ n:", "  if p is still marked: it's prime", "    cross out p², p² + p, p² + 2p, … up to n", "everything still marked is prime"],
  input: numbers({ sample: [100], min_count: 1, max_count: 1, min: 10, max: 300, hint: "Find the primes up to n (10–300)", random_count: 1 }),
  *run([n]: number[]): Generator<Step, { primes: number[] }> {
    const composite = new Array(n + 1).fill(false);
    let crossings = 0;
    const per_row = 10;
    const board = (p = -1, marks: Set<number> = new Set()): View =>
      grid({
        title: `2 to ${n}`,
        board: true,
        rows: Array.from({ length: Math.ceil((n + 1) / per_row) }, (_, r) =>
          Array.from({ length: per_row }, (_, c): Cell | null => {
            const value = r * per_row + c;
            if (value > n) return null;
            if (value < 2) return { text: "", tone: Tone.MUTED };
            return { text: String(value), tone: value === p ? Tone.ACTIVE : marks.has(value) ? Tone.BAD : composite[value] ? Tone.MUTED : p === -1 && !composite[value] ? Tone.DONE : undefined };
          })
        ),
      });
    yield { views: [board(0)], line: 0, note: `Every number from 2 to ${n} might be prime.`, counters: { crossings } };
    for (let p = 2; p * p <= n; p++) {
      if (composite[p]) continue;
      const hit = new Set<number>();
      for (let m = p * p; m <= n; m += p) {
        if (!composite[m]) crossings++;
        composite[m] = true;
        hit.add(m);
      }
      yield { views: [board(p, hit)], line: 3, note: `${p} is prime. Cross out its multiples from ${p * p}: ${hit.size} of them.`, counters: { crossings } };
    }
    const primes = Array.from({ length: n + 1 }, (_, i) => i).filter((i) => i >= 2 && !composite[i]);
    yield { views: [board()], line: 4, note: `${primes.length} primes up to ${n}. The largest is ${primes.at(-1)}.`, counters: { crossings, primes: primes.length } };
    return { primes };
  },
});

const fast_power = define({
  intro:
    "Computing b^e by multiplying e times is far too slow for big e. Write e in binary instead: square b over and over (b, b², b⁴, b⁸, …) and multiply in the squares where e has a 1 bit. That takes about log₂ e steps. Taking everything mod m keeps the numbers small.",
  use: "RSA and Diffie–Hellman (huge exponents mod a prime), matrix powers for Fibonacci, primality tests.",
  traits: ["O(log e)", "Square and multiply"],
  pseudocode: ["result ← 1", "while e > 0:", "  if the lowest bit of e is 1: result ← result · b mod m", "  b ← b² mod m; e ← e >> 1", "return result"],
  input: numbers({ sample: [3, 45, 1000], min_count: 3, max_count: 3, min: 1, max: 1000000, hint: "Base, exponent, modulus: 3 45 1000", random_count: 3 }),
  *run([base_in, exponent, modulus]: number[]): Generator<Step, { result: number }> {
    const mod = (x: bigint) => x % BigInt(modulus);
    let result = 1n;
    let b = mod(BigInt(base_in));
    let e = exponent;
    let multiplications = 0;
    const bits = exponent.toString(2);
    const rows: string[][] = [];
    const view = (bit: number): View[] => [
      grid({ title: `exponent ${exponent} in binary`, rows: [[...bits].map((char, i) => ({ text: char, tone: i === bits.length - 1 - bit ? Tone.ACTIVE : i > bits.length - 1 - bit ? Tone.MUTED : undefined }))] }),
      grid({ title: "steps", col_labels: ["bit", "b", "result"], rows: rows.map((row) => row.map((text) => ({ text }))) }),
    ];
    yield { views: view(-1), line: 0, note: `${base_in}^${exponent} mod ${modulus}. ${exponent} is ${bits} in binary.`, counters: { multiplications } };
    for (let bit = 0; e > 0; bit++) {
      const one = (e & 1) === 1;
      if (one) {
        result = mod(result * b);
        multiplications++;
      }
      rows.push([String(e & 1), b.toString(), result.toString()]);
      yield { views: view(bit), line: one ? 2 : 3, note: one ? `Bit ${bit} is 1: multiply the result by ${b}, giving ${result}.` : `Bit ${bit} is 0: skip it.`, counters: { multiplications } };
      b = mod(b * b);
      multiplications++;
      e = Math.floor(e / 2);
    }
    yield { views: [...view(bits.length), { kind: "text", title: "result", lines: [{ text: result.toString(), tone: Tone.DONE }] }], line: 4, note: `${base_in}^${exponent} mod ${modulus} = ${result}, with ${multiplications} multiplications instead of ${exponent - 1}.`, counters: { multiplications } };
    return { result: Number(result) };
  },
});

const fisher_yates = define({
  intro:
    "To shuffle so every order is equally likely, walk from the end: swap the current position with a random position at or before it, then step left. Each element is placed once, so it's O(n), and every one of the n! orders has the same chance. Picking the swap from the whole array instead gives a subtly biased shuffle.",
  use: "Card games, randomised experiments and playlists, and as the first step of randomised algorithms like quicksort's pivot.",
  traits: ["O(n)", "Unbiased", "In place"],
  pseudocode: ["for i from n − 1 down to 1:", "  j ← a random index from 0 to i", "  swap a[i], a[j]"],
  input: numbers({ sample: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], max_count: 30, min: 0, max: 999, random_count: 10 }),
  params: [{ id: "seed", label: "Seed", kind: "number", min: 0, max: 999, default: 7 }],
  *run(input: number[], params): Generator<Step, { shuffled: number[] }> {
    const a = [...input];
    const random = seeded(Number(params.seed ?? 7));
    let swaps = 0;
    const frame = (note: string, line: number, tones: Record<number, Tone>): Step => ({ views: [{ kind: "bars", values: a, tones }], line, note, counters: { swaps } });
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      yield frame(`Pick a random position from 0 to ${i}: ${j}.`, 1, { ...range_tones(i + 1, a.length, Tone.DONE), [i]: Tone.ACTIVE, [j]: Tone.COMPARE });
      [a[i], a[j]] = [a[j], a[i]];
      swaps++;
      yield frame(i === j ? `It's the same position: ${a[i]} stays.` : `Swap ${a[j]} and ${a[i]}. Position ${i} is final.`, 2, { ...range_tones(i, a.length, Tone.DONE), [j]: Tone.WARN });
    }
    yield frame("Shuffled. Change the seed for another order.", -1, range_tones(0, a.length, Tone.DONE));
    return { shuffled: a };
  },
});

const reservoir = define({
  intro:
    "Pick k items uniformly at random from a stream whose length you don't know, keeping only k at a time. Keep the first k. For the i-th item after that, keep it with probability k/i, replacing a random one of the kept items. Every item seen ends up kept with the same probability, k/n.",
  use: "Sampling logs, network packets or database rows in one pass without knowing the total.",
  traits: ["One pass", "O(k) memory"],
  pseudocode: ["keep the first k items", "for item i (counting from 1) after that:", "  j ← a random number from 1 to i", "  if j ≤ k: replace kept item j with it"],
  input: numbers({ sample: [12, 7, 42, 3, 19, 25, 8, 33, 16, 4, 29, 11], max_count: 40, min: 0, max: 999, random_count: 14, hint: "The stream: numbers, comma separated" }),
  params: [
    { id: "k", label: "Keep k", kind: "number", min: 1, max: 6, default: 3 },
    { id: "seed", label: "Seed", kind: "number", min: 0, max: 999, default: 7 },
  ],
  *run(stream: number[], params): Generator<Step, { kept: number[] }> {
    const k = Number(params.k ?? 3);
    const random = seeded(Number(params.seed ?? 7));
    const kept: number[] = [];
    const frame = (note: string, line: number, at: number, marks: Record<number, Tone> = {}): Step => ({
      views: [
        grid({ title: "stream", rows: [stream.map((value, i) => ({ text: String(value), tone: i === at ? Tone.ACTIVE : i < at ? Tone.MUTED : undefined }))] }),
        grid({ title: `kept (k = ${k})`, rows: [kept.length ? kept.map((value, i) => ({ text: String(value), tone: marks[i] })) : [{ text: "empty", tone: Tone.MUTED }]] }),
      ],
      line,
      note,
      counters: { seen: Math.min(at + 1, stream.length), kept: kept.length },
    });
    for (let i = 0; i < stream.length; i++) {
      if (i < k) {
        kept.push(stream[i]);
        yield frame(`One of the first ${k}: keep ${stream[i]}.`, 0, i, { [kept.length - 1]: Tone.WARN });
        continue;
      }
      const j = Math.floor(random() * (i + 1));
      if (j < k) {
        const old = kept[j];
        kept[j] = stream[i];
        yield frame(`Item ${i + 1}: drew ${j + 1} ≤ ${k} (chance ${k}/${i + 1}): ${stream[i]} replaces ${old}.`, 3, i, { [j]: Tone.WARN });
      } else yield frame(`Item ${i + 1}: drew ${j + 1} > ${k}: skip ${stream[i]}.`, 2, i);
    }
    yield frame(`Done: every one of the ${stream.length} items had a ${k}/${stream.length} chance to be kept.`, -1, stream.length);
    return { kept };
  },
});

const CRC_POLY = 0xedb88320;

export function crc32(value: string): number {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ CRC_POLY : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const hex = (value: number) => (value >>> 0).toString(16).padStart(8, "0");

const crc = define({
  intro:
    "CRC32 is a checksum that catches accidental changes: flipped bits, swapped bytes, truncation. It treats the data as one huge binary number and takes its remainder when divided by a fixed polynomial, using XOR instead of subtraction. Processing a byte means XOR-ing it in, then 8 shift steps that XOR the polynomial whenever a 1 falls out.",
  use: "Zip, PNG, Ethernet frames and disk sectors, to detect corrupted data (not tampering: use a cryptographic hash for that).",
  traits: ["Checksum", "Detects burst errors", "Not cryptographic"],
  pseudocode: ["crc ← FFFFFFFF", "for each byte: crc ← crc XOR byte", "  8 times: if the low bit is 1: crc ← (crc >> 1) XOR EDB88320, else crc ← crc >> 1", "return crc XOR FFFFFFFF"],
  input: text({ sample: "123456789", max_length: 24, alphabet: "abcdef0123", random_length: 8, hint: "Text to checksum, up to 24 characters" }),
  *run(value: string): Generator<Step, { crc: number }> {
    const bytes = [...new TextEncoder().encode(value)];
    let reg = 0xffffffff;
    let shifts = 0;
    const view = (active: number, bits?: string): View[] => [
      grid({ title: "bytes", col_labels: bytes.map((_, i) => String(i)), rows: [bytes.map((byte, i) => ({ text: byte.toString(16).padStart(2, "0"), tone: i === active ? Tone.ACTIVE : i < active ? Tone.MUTED : undefined }))] }),
      { kind: "text", title: "register", lines: [{ text: hex(reg), tone: Tone.MARK }, ...(bits ? [{ text: bits }] : [])] },
    ];
    yield { views: view(-1), line: 0, note: `Start with FFFFFFFF. ${bytes.length} bytes to process.`, counters: { shifts } };
    for (const [i, byte] of bytes.entries()) {
      reg = (reg ^ byte) >>> 0;
      const trail: string[] = [];
      for (let bit = 0; bit < 8; bit++) {
        const low = reg & 1;
        reg = low ? ((reg >>> 1) ^ CRC_POLY) >>> 0 : reg >>> 1;
        trail.push(String(low));
        shifts++;
      }
      yield { views: view(i, `bits out: ${trail.join(" ")}`), line: 2, note: `Byte ${i} (${byte.toString(16).padStart(2, "0")}): XOR it in, then 8 shifts; ${trail.filter((b) => b === "1").length} of them XOR the polynomial. Register ${hex(reg)}.`, counters: { shifts } };
    }
    const result = (reg ^ 0xffffffff) >>> 0;
    yield { views: [...view(bytes.length), { kind: "text", title: "CRC32", lines: [{ text: hex(result).toUpperCase(), tone: Tone.DONE }] }], line: 3, note: `Flip all bits at the end: CRC32 = ${hex(result).toUpperCase()}.`, counters: { shifts } };
    return { crc: result };
  },
});

export default {
  euclid,
  sieve,
  "fast-power": fast_power,
  "fisher-yates": fisher_yates,
  "reservoir-sampling": reservoir,
  crc32: crc,
} as unknown as Record<string, Definition>;
