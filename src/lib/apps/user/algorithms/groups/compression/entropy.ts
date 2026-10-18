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

export default { huffman };
