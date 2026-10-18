import { define } from "../../engine/definition";
import { text } from "../../engine/inputs";
import { grid, range_tones, Tone, type Cell, type Step, type Tones, type View } from "../../engine/step";
import { huffman_code_map, huffman_snapshot, huffman_tree, type HNode } from "../trees/forests";
import { chars_view, ratio, show } from "./common";

function bits_view(bits: string, tones: Tones, padding = 0, title = "bit stream"): View {
  const all = bits + "0".repeat(padding);
  const rows = Math.ceil(all.length / 8) || 1;
  return grid({
    title,
    row_labels: Array.from({ length: rows }, (_, r) => {
      const byte = all.slice(r * 8, r * 8 + 8);
      return byte.length === 8 ? `0x${Number.parseInt(byte, 2).toString(16).padStart(2, "0")}` : `byte ${r}`;
    }),
    rows: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: 8 }, (_, k): Cell | null => {
        const i = r * 8 + k;
        if (i >= all.length) return null;
        return { text: all[i], tone: i >= bits.length ? Tone.MUTED : tones[i] };
      })
    ),
  });
}

function path_to(root: HNode, char: string): HNode[] {
  if (root.char === char) return [root];
  for (const child of [root.left, root.right]) {
    if (!child) continue;
    const below = path_to(child, char);
    if (below.length) return [root, ...below];
  }
  return [];
}

const huffman = define({
  intro:
    "Huffman coding turns text into bits. Build the Huffman tree from the symbol counts, so frequent symbols sit near the root, then replace every symbol by its path: left is 0, right is 1. No code is the start of another, so the decoder needs no separators: it walks down from the root bit by bit and writes a symbol each time it reaches a leaf.",
  use: "The final stage of DEFLATE (zip, gzip, PNG), JPEG and MP3; anywhere symbols have skewed frequencies.",
  traits: ["Lossless", "Prefix-free", "Whole bits per symbol"],
  pseudocode: [
    "count the symbols and build the Huffman tree (Trees › Huffman tree shows each merge)",
    "code[c] ← the path from the root to c's leaf: left 0, right 1",
    "for each symbol c: append code[c] to the bit stream",
    "pad the last byte with zeros; a real file also stores the symbol count and the code lengths",
    "decode: from the root, follow each bit, 0 left, 1 right",
    "  at a leaf: write its symbol, go back to the root; stop after n symbols",
  ],
  input: text({ sample: "abracadabra", max_length: 60, alphabet: "aaaabbbccde ", random_length: 24, hint: "Text to encode, up to 60 characters" }),
  presets: [
    { label: "abracadabra", value: "abracadabra" },
    { label: "Skewed", value: "aaaaaaaaaaaaaaabbbbbbbccd" },
    { label: "Even spread", value: "abcdefgh" },
    { label: "One symbol", value: "zzzzzz" },
  ],
  *run(source: string): Generator<Step, { bits: string; bytes: number[]; decoded: string }> {
    const root = huffman_tree(source);
    const codes = huffman_code_map(root);
    const counts = new Map<string, number>();
    for (const char of source) counts.set(char, (counts.get(char) ?? 0) + 1);
    let bits = "";
    let decoded = "";
    const padding = () => (8 - (bits.length % 8)) % 8;
    const tree = (marks: Map<HNode, Tone> = new Map()): View => ({ kind: "tree", title: "Huffman tree", roots: [huffman_snapshot(root, marks, "")] });
    const table = (active?: string): View =>
      grid({ title: "codes", row_labels: [...codes.keys()].map(show), rows: [...codes].map(([char, code]) => [{ text: code, tone: char === active ? Tone.ACTIVE : Tone.DONE }, { text: `× ${counts.get(char)}` }]) });
    const path_marks = (char: string) => {
      const path = path_to(root, char);
      return new Map(path.map((node, i): [HNode, Tone] => [node, i === path.length - 1 ? Tone.ACTIVE : Tone.COMPARE]));
    };
    const counters = () => ({ bits: bits.length, "plain bits": source.length * 8, size: ratio(source.length * 8, bits.length + padding()) });

    yield { views: [chars_view(source, {}), tree(), table()], line: 0, note: `${source.length} symbols, ${codes.size} different. Build the tree from their counts: the frequent ones end up near the root.`, counters: counters() };
    yield {
      views: [chars_view(source, {}), tree(), table()],
      line: 1,
      note: codes.size === 1 ? `Only one symbol, so the tree is a single leaf: give it the one-bit code 0.` : `Each symbol's code is its path from the root. Frequent symbols get short codes, rare ones long codes.`,
      counters: counters(),
    };
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      const code = codes.get(char)!;
      const start = bits.length;
      bits += code;
      yield {
        views: [chars_view(source, { ...range_tones(0, i, Tone.MUTED), [i]: Tone.ACTIVE }), tree(path_marks(char)), bits_view(bits, range_tones(start, bits.length, Tone.WARN)), table(char)],
        line: 2,
        note: `“${show(char)}” → ${code}. The stream is ${bits.length} ${bits.length === 1 ? "bit" : "bits"} long.`,
        counters: counters(),
      };
    }
    const pad = padding();
    const all = bits + "0".repeat(pad);
    const bytes = Array.from({ length: all.length / 8 }, (_, k) => Number.parseInt(all.slice(k * 8, k * 8 + 8), 2));
    yield {
      views: [chars_view(source, {}), bits_view(bits, {}, pad), { kind: "text", title: "bytes", lines: bytes.map((byte) => ({ text: byte.toString(16).padStart(2, "0"), tone: Tone.DONE })) }, table()],
      line: 3,
      note: `${bits.length} bits${pad ? `, plus ${pad} zero ${pad === 1 ? "bit" : "bits"} of padding,` : ""} make ${bytes.length} ${bytes.length === 1 ? "byte" : "bytes"} instead of ${source.length}. The decoder also needs the code table and the symbol count, so it can ignore the padding.`,
      counters: counters(),
    };
    let at = 0;
    while (decoded.length < source.length) {
      let node = root;
      const from = at;
      if (node.char === undefined)
        while (node.char === undefined) {
          node = bits[at] === "0" ? node.left! : node.right!;
          at++;
        }
      else at++;
      decoded += node.char!;
      yield {
        views: [
          bits_view(bits, { ...range_tones(0, from, Tone.MUTED), ...range_tones(from, at, Tone.ACTIVE) }, pad),
          tree(path_marks(node.char!)),
          { kind: "text", title: "decoded", lines: [{ text: [...decoded].map(show).join(""), tone: Tone.DONE }] },
        ],
        line: 5,
        note: `Bits ${bits.slice(from, at)} lead from the root to the leaf “${show(node.char)}”. Write it and start again at the root.`,
        counters: { ...counters(), decoded: decoded.length },
      };
    }
    yield {
      views: [bits_view(bits, {}, pad), { kind: "text", title: "decoded", lines: [{ text: [...decoded].map(show).join(""), tone: Tone.DONE }] }, table()],
      line: -1,
      note: `Done: ${source.length} symbols in ${bits.length} bits, ${(bits.length / source.length).toFixed(2)} bits per symbol instead of 8, and they decode back exactly.`,
      counters: counters(),
    };
    return { bits, bytes, decoded };
  },
});

function log2_big(value: bigint): number {
  const binary = value.toString(2);
  const top = binary.slice(0, 53);
  return Math.log2(Number.parseInt(top, 2)) + (binary.length - top.length);
}

function decimal(num: bigint, den: bigint, digits: number): string {
  if (num >= den) return "1";
  const scaled = (num * 10n ** BigInt(digits)) / den;
  return `0.${scaled.toString().padStart(digits, "0")}`;
}

const arithmetic = define({
  intro:
    "Arithmetic coding turns the whole message into one number. Start with the interval [0, 1) and give every symbol a slot as wide as its probability. Each symbol narrows the interval to its slot, so a likely symbol barely shrinks it and costs only a fraction of a bit. At the end, any number inside the final interval names the message; the shortest binary fraction there is the output, about −log₂ of the message's probability. Real coders work with fixed-width integers and send leading bits as soon as low and high agree on them; this one keeps exact fractions so you can watch the interval shrink.",
  use: "Wherever the last fraction of a bit matters: CABAC in H.264 and H.265 video, JPEG XL, and the range coder in LZMA (7-Zip, xz).",
  traits: ["Lossless", "Fractional bits per symbol", "Beats Huffman on skewed data"],
  pseudocode: [
    "p(c) ← count(c) / n; give each symbol a slot of [0, 1) that wide",
    "low ← 0, high ← 1",
    "for each symbol c:",
    "  width ← high − low",
    "  high ← low + width · slot_end(c); low ← low + width · slot_start(c)",
    "output the shortest binary fraction v with low ≤ v < high",
    "decode: find the slot holding v, write its symbol, narrow to that slot; n times",
  ],
  input: text({ sample: "abracadabra", max_length: 32, alphabet: "aaaabbc", random_length: 12, hint: "Text to encode, up to 32 characters" }),
  presets: [
    { label: "abracadabra", value: "abracadabra" },
    { label: "Skewed", value: "aaaaaaaaaaaaaaab" },
    { label: "Even spread", value: "abcdabcd" },
    { label: "One symbol", value: "zzzzzz" },
  ],
  *run(source: string): Generator<Step, { bits: string; decoded: string }> {
    const counts = new Map<string, number>();
    for (const char of source) counts.set(char, (counts.get(char) ?? 0) + 1);
    const symbols = [...counts.keys()];
    const total = BigInt(source.length);
    const start = new Map<string, bigint>();
    let running = 0n;
    for (const char of symbols) {
      start.set(char, running);
      running += BigInt(counts.get(char)!);
    }
    const huffman_table = huffman_code_map(huffman_tree(source));
    const huffman_bits = [...source].reduce((sum, char) => sum + huffman_table.get(char)!.length, 0);
    let low = 0n;
    let width = 1n;
    let den = 1n;
    const info = () => log2_big(den) - log2_big(width);
    const digits = () => Math.min(40, Math.max(3, Math.ceil(info() * 0.30103) + 2));
    const history: { char: string; low: string; high: string }[] = [];

    const model: View = grid({
      title: "model: slots of [0, 1)",
      col_labels: symbols.map(show),
      row_labels: ["p", "slot"],
      rows: [
        symbols.map((char) => ({ text: `${counts.get(char)}/${source.length}` })),
        symbols.map((char) => ({ text: `${decimal(start.get(char)!, total, 3)}–${decimal(start.get(char)! + BigInt(counts.get(char)!), total, 3)}` })),
      ],
    });
    const split = (active?: string): View => {
      const d = digits() + 1;
      return grid({
        title: "the current interval, split into slots",
        col_labels: symbols.map(show),
        rows: [
          symbols.map((char) => {
            const from = low * total + width * start.get(char)!;
            const to = from + width * BigInt(counts.get(char)!);
            return { text: `${decimal(from, den * total, d)}–${decimal(to, den * total, d)}`, tone: char === active ? Tone.ACTIVE : undefined };
          }),
        ],
      });
    };
    const steps = (): View =>
      grid({
        title: "interval after each symbol",
        col_labels: ["symbol", "low", "high"],
        rows: [[{ text: "start" }, { text: "0" }, { text: "1" }], ...history.map((row, i) => [{ text: show(row.char), tone: i === history.length - 1 ? Tone.WARN : undefined }, { text: row.low }, { text: row.high }])],
      });
    const counters = (extra: Record<string, number | string> = {}) => ({ "information (bits)": info().toFixed(2), "Huffman bits": huffman_bits, ...extra });

    yield { views: [chars_view(source, {}), model], line: 0, note: `Count the symbols: each gets a slot of [0, 1) as wide as its share of the ${source.length}.`, counters: counters() };
    yield { views: [chars_view(source, {}), split(), steps(), model], line: 1, note: "The interval starts as all of [0, 1): nothing is decided yet.", counters: counters() };
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      yield { views: [chars_view(source, { ...range_tones(0, i, Tone.MUTED), [i]: Tone.ACTIVE }), split(char), steps(), model], line: 3, note: `Next symbol “${show(char)}”: its slot is the ${counts.get(char)}/${source.length} of the current interval shown lit.`, counters: counters() };
      low = low * total + width * start.get(char)!;
      width = width * BigInt(counts.get(char)!);
      den = den * total;
      const d = digits();
      history.push({ char, low: decimal(low, den, d), high: decimal(low + width, den, d) });
      yield {
        views: [chars_view(source, { ...range_tones(0, i + 1, Tone.MUTED) }), split(), steps(), model],
        line: 4,
        note: `Narrow to that slot: [${history.at(-1)!.low}, ${history.at(-1)!.high}). The interval is now ${info().toFixed(2)} bits narrow${counts.get(char) === source.length ? " (a certain symbol costs nothing)" : ""}.`,
        counters: counters(),
      };
    }
    let b = 0;
    let m = 0n;
    for (; ; b++) {
      const scale = 1n << BigInt(b);
      m = (low * scale + den - 1n) / den;
      if (m * den < (low + width) * scale) break;
    }
    const bits = b ? m.toString(2).padStart(b, "0") : "";
    const value = (d: number) => decimal(m, 1n << BigInt(b), d);
    yield {
      views: [steps(), { kind: "text", title: `output: ${b} ${b === 1 ? "bit" : "bits"}`, lines: [{ text: bits ? `0.${bits}₂ = ${value(Math.max(b, 3))}` : "nothing at all", tone: Tone.DONE }] }],
      line: 5,
      note: bits
        ? `The shortest binary fraction inside the final interval is 0.${bits}₂. Those ${b} bits are the whole message, against ${huffman_bits} for Huffman and ${source.length * 8} as plain text.`
        : `The final interval is still all of [0, 1), so zero bits do: with the symbol count the decoder knows everything.`,
      counters: counters({ "output bits": b }),
    };
    const scale = 1n << BigInt(b);
    low = 0n;
    width = 1n;
    den = 1n;
    let decoded = "";
    while (decoded.length < source.length) {
      const target = ((m * den - low * scale) * total) / (width * scale);
      const char = symbols.find((c) => start.get(c)! <= target && target < start.get(c)! + BigInt(counts.get(c)!))!;
      const before = split(char);
      low = low * total + width * start.get(char)!;
      width = width * BigInt(counts.get(char)!);
      den = den * total;
      decoded += char;
      yield {
        views: [before, { kind: "text", title: "v", lines: [{ text: value(Math.max(b, 3)), tone: Tone.COMPARE }] }, { kind: "text", title: "decoded", lines: [{ text: [...decoded].map(show).join(""), tone: Tone.DONE }] }],
        line: 6,
        note: `v falls in the slot of “${show(char)}”: write it and narrow to that slot.`,
        counters: counters({ "output bits": b, decoded: decoded.length }),
      };
    }
    yield {
      views: [chars_view(source, {}), { kind: "text", title: "decoded", lines: [{ text: [...decoded].map(show).join(""), tone: Tone.DONE }] }],
      line: -1,
      note: `Done: ${source.length} symbols in ${b} ${b === 1 ? "bit" : "bits"} (${(b / source.length).toFixed(2)} per symbol; Huffman needs ${huffman_bits}), decoded back exactly.`,
      counters: counters({ "output bits": b }),
    };
    return { bits, decoded };
  },
});

export default { huffman, arithmetic };
