import { define, type Definition } from "../../engine/definition";
import { InputError, text, type InputSpec } from "../../engine/inputs";
import { grid, range_tones, Tone, type Cell, type Step, type Tones, type View } from "../../engine/step";
import { chars_view, ratio, show } from "./common";
import entropy from "./entropy";
import { best_of, candidates, dict_to_bin, lz77_decode, type Triple } from "./lz77";

const rle = define({
  intro:
    "Run-length encoding replaces a run of the same symbol with the symbol and how often it repeats: aaaabbb becomes 4a3b. It's trivial to encode and decode in one pass. It shines on long runs (icons, fax scans, masks) and makes text without runs bigger.",
  use: "Simple bitmaps and masks (BMP, PCX, TIFF, fax), as a stage in bigger compressors (after BWT + move-to-front), and in game level data.",
  traits: ["Lossless", "One pass"],
  pseudocode: ["i ← 0", "while i < n:", "  count how many times data[i] repeats from i", "  output count, then the symbol", "  i ← i + count"],
  input: text({ sample: "aaaabbbccccccd", max_length: 64, alphabet: "aaabbc", random_length: 24, hint: "Text to encode, up to 64 characters" }),
  presets: [
    { label: "Long runs", value: "wwwwwwwwwwwwbwwwwwwwwwwwwbbbwwwwwwwwwwwwwwwwwwwwwwwwbwwwwwwwwwwwwww" },
    { label: "No runs", value: "abcdefgh" },
  ],
  *run(data: string) {
    const out: string[] = [];
    let i = 0;
    const encoded = () => out.join("");
    const frame = (note: string, line: number, tones: Tones = {}): Step => ({
      views: [chars_view(data, tones), { kind: "text", title: "encoded", lines: out.map((text) => ({ text })) }],
      line,
      note,
      counters: { "input chars": data.length, "output chars": encoded().length, size: ratio(data.length, encoded().length) },
    });
    while (i < data.length) {
      let count = 1;
      while (i + count < data.length && data[i + count] === data[i]) count++;
      yield frame(`“${show(data[i])}” repeats ${count} ${count === 1 ? "time" : "times"} from position ${i}.`, 2, { ...range_tones(0, i, Tone.MUTED), ...range_tones(i, i + count, Tone.ACTIVE) });
      out.push(`${count}${data[i]}`);
      yield frame(`Write ${count}${show(data[i])}.`, 3, { ...range_tones(0, i + count, Tone.MUTED) });
      i += count;
    }
    yield frame(`Done: ${data.length} characters became ${encoded().length} (${ratio(data.length, encoded().length)}).`, -1);
    return { encoded: encoded() };
  },
});

const lz77 = define({
  intro:
    "LZ77 slides a window over the text. For each position it looks back through the search buffer for the longest earlier copy of what comes next, then writes a triple: how far back the copy starts, how long it is, and the next character. A match may even overlap the text it is producing, which is how 'aaaa' becomes one short copy.",
  use: "The core of DEFLATE (zip, gzip, PNG), and the idea behind LZ4, Snappy and zstd.",
  traits: ["Lossless", "Sliding window", "Dictionary"],
  pseudocode: [
    "i ← 0",
    "while i < n:",
    "  look back up to search-buffer characters for the start of a match",
    "  extend each match into the look-ahead (it may overlap: j + (k mod distance))",
    "  keep the longest; output (distance, length, next character)",
    "  i ← i + length + 1",
    "binary: 2-bit header (bytes per value), then fixed-width distance, length, character",
  ],
  credit: { text: "lilBunnyRabbit's LZ77 gist", url: "https://gist.github.com/lilBunnyRabbit/9a8f338a2ce2bf86fa463d5af13a27b6" },
  input: text({ sample: "abracadabra abracadabra", max_length: 96, alphabet: "aab", random_length: 24, hint: "Text to compress, up to 96 characters" }),
  presets: [
    { label: "Repeats", value: "abracadabra abracadabra" },
    { label: "Overlapping run", value: "aaaaaaaaaab" },
    { label: "Song", value: "la la la la, la la la la, la la la la la" },
  ],
  params: [
    { id: "search", label: "Search buffer", kind: "number", min: 1, max: 255, default: 255 },
    { id: "look", label: "Look-ahead buffer", kind: "number", min: 1, max: 255, default: 255 },
  ],
  *run(data: string, params) {
    const search = Number(params.search ?? 255);
    const look = Number(params.look ?? 255);
    const dict: Triple[] = [];
    let comparisons = 0;
    const triples = (): View => ({ kind: "text", title: "triples (distance, length, next)", lines: dict.map(([d, l, c]) => ({ text: `(${d}, ${l}, ${show(c)})`, tone: l > 0 ? Tone.DONE : undefined })) });
    const frame = (note: string, line: number, tones: Tones = {}, extra: View[] = []): Step => ({
      views: [chars_view(data, tones), triples(), ...extra],
      line,
      note,
      counters: { triples: dict.length, comparisons },
    });
    const windows = (i: number): Tones => ({
      ...range_tones(0, Math.max(0, i - search), Tone.MUTED),
      ...range_tones(Math.max(0, i - search), i, Tone.MARK),
      ...range_tones(i, Math.min(data.length, i + look), Tone.COMPARE),
    });
    for (let i = 0; i < data.length; i++) {
      yield frame(`Position ${i}. The search buffer is ${Math.max(0, i - search)}–${i - 1 < 0 ? "empty" : i - 1}; the look-ahead starts at ${i}.`, 2, windows(i));
      const found = candidates(data, i, search, look);
      comparisons += found.reduce((sum, candidate) => sum + candidate.length + 1, 0);
      for (const candidate of found.slice(0, 6)) {
        const start = i - candidate.distance;
        yield frame(
          `A copy starting ${candidate.distance} back matches ${candidate.length} ${candidate.length === 1 ? "character" : "characters"}${candidate.length > candidate.distance ? " (it overlaps the text it's making)" : ""}.`,
          3,
          { ...windows(i), ...range_tones(start, start + Math.min(candidate.length, candidate.distance), Tone.ACTIVE), ...range_tones(i, i + candidate.length, Tone.DONE) }
        );
      }
      const best = best_of(found);
      const next = data[i + best.length];
      dict.push([best.distance, best.length, next]);
      yield frame(
        best.length ? `Longest: ${best.length} back ${best.distance}. Output (${best.distance}, ${best.length}, ${show(next)}).` : `No earlier copy of “${show(data[i])}”: output the literal (0, 0, ${show(next)}).`,
        4,
        { ...range_tones(0, i, Tone.MUTED), ...range_tones(i, i + best.length, Tone.DONE), [i + best.length]: Tone.WARN }
      );
      i += best.length;
    }
    const bin = dict_to_bin(dict);
    const bytes = Number.parseInt(bin.slice(0, 2), 2);
    const decoded = lz77_decode(dict);
    const groups = [bin.slice(0, 2), ...Array.from({ length: dict.length }, (_, t) => bin.slice(2 + t * bytes * 24, 2 + (t + 1) * bytes * 24))];
    const bits_view: View = { kind: "text", title: `binary: ${bin.length} bits, ${bytes} byte${bytes === 1 ? "" : "s"} per value`, lines: groups.map((text, index) => ({ text, tone: index === 0 ? Tone.MARK : undefined })) };
    yield {
      ...frame(
        `Done: ${dict.length} triples. In binary that's ${bin.length} bits against ${data.length * 8} for the plain text (${ratio(data.length * 8, bin.length)}). Decoding gives the text back ${decoded === data ? "exactly" : "wrong"}.`,
        6,
        {},
        [bits_view]
      ),
      counters: { triples: dict.length, comparisons, bits: bin.length, size: ratio(data.length * 8, bin.length) },
    };
    return { dict, bin, decoded };
  },
});

const lz78 = define({
  intro:
    "LZ78 builds a dictionary of phrases as it reads. At each step it finds the longest phrase already in the dictionary that matches what comes next, outputs that phrase's number plus the next character, and adds that longer phrase to the dictionary. No window: the dictionary grows with the text.",
  use: "Historical (the base of LZW and GIF); good for understanding dictionary coders.",
  traits: ["Lossless", "Growing dictionary"],
  pseudocode: ["dictionary ← {0: empty}", "while there's input:", "  find the longest phrase w in the dictionary that starts here", "  output (index of w, next character c)", "  add w + c to the dictionary"],
  input: text({ sample: "abababababa", max_length: 64, alphabet: "aab", random_length: 20, hint: "Text to compress, up to 64 characters" }),
  *run(data: string) {
    const dict = new Map<string, number>([["", 0]]);
    const out: [number, string][] = [];
    const frame = (note: string, line: number, tones: Tones = {}, active?: string): Step => ({
      views: [
        chars_view(data, tones),
        grid({ title: "dictionary", col_labels: [...dict.values()].map(String), rows: [[...dict.keys()].map((phrase) => ({ text: phrase === "" ? "∅" : [...phrase].map(show).join(""), tone: phrase === active ? Tone.ACTIVE : undefined }))] }),
        { kind: "text", title: "output (index, next)", lines: out.map(([index, char]) => ({ text: `(${index}, ${show(char)})` })) },
      ],
      line,
      note,
      counters: { phrases: dict.size - 1, outputs: out.length },
    });
    let i = 0;
    while (i < data.length) {
      let w = "";
      while (i + w.length < data.length && dict.has(w + data[i + w.length])) w += data[i + w.length];
      const c = data[i + w.length] ?? "";
      yield frame(w ? `The longest known phrase here is “${w}” (#${dict.get(w)}).` : "No phrase starts with this character yet.", 2, { ...range_tones(0, i, Tone.MUTED), ...range_tones(i, i + w.length, Tone.ACTIVE), [i + w.length]: Tone.WARN }, w);
      out.push([dict.get(w)!, c]);
      if (c) dict.set(w + c, dict.size);
      yield frame(`Output (${dict.get(w)}, ${show(c)})${c ? ` and add “${w + c}” as #${dict.size - 1}` : ""}.`, 4, range_tones(0, i + w.length + 1, Tone.MUTED), w + c);
      i += w.length + 1;
    }
    const decoded = (() => {
      const phrases = [""];
      let text_out = "";
      for (const [index, char] of out) {
        const phrase = phrases[index] + char;
        phrases.push(phrase);
        text_out += phrase;
      }
      return text_out;
    })();
    yield frame(`Done: ${out.length} pairs for ${data.length} characters.`, -1);
    return { out, decoded };
  },
});

const lzw = define({
  intro:
    "LZW starts with a dictionary of single characters and outputs only numbers. It extends the current phrase while the extension is in the dictionary; when it isn't, it outputs the phrase's code and adds the extension as a new entry. The decoder rebuilds the same dictionary from the codes alone, so the dictionary is never sent.",
  use: "GIF images, the Unix compress tool, TIFF and early PDF.",
  traits: ["Lossless", "Codes only", "Self-building dictionary"],
  pseudocode: ["dictionary ← every single character", "w ← empty", "for each character c:", "  if w + c is in the dictionary: w ← w + c", "  else: output code(w); add w + c; w ← c", "output code(w)"],
  input: text({ sample: "TOBEORNOTTOBEORTOBEORNOT", max_length: 64, alphabet: "ab", random_length: 20, hint: "Text to compress, up to 64 characters" }),
  *run(data: string) {
    const alphabet = [...new Set(data)].sort();
    const dict = new Map<string, number>(alphabet.map((char, i) => [char, i]));
    const out: number[] = [];
    let w = "";
    const frame = (note: string, line: number, i: number, added?: string): Step => ({
      views: [
        chars_view(data, { ...range_tones(0, i - w.length, Tone.MUTED), ...range_tones(i - w.length, i, Tone.ACTIVE), [i]: Tone.COMPARE }),
        grid({ title: "dictionary", col_labels: [...dict.values()].map(String), rows: [[...dict.keys()].map((phrase) => ({ text: [...phrase].map(show).join(""), tone: phrase === added ? Tone.WARN : phrase === w ? Tone.ACTIVE : undefined }))] }),
        { kind: "text", title: "codes", lines: out.map((code) => ({ text: String(code) })) },
      ],
      line,
      note,
      counters: { codes: out.length, entries: dict.size },
    });
    yield frame(`Start with the ${alphabet.length} characters that appear: ${alphabet.map(show).join(" ")}.`, 0, 0);
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (dict.has(w + c)) {
        w += c;
        yield frame(`“${[...w].map(show).join("")}” is in the dictionary: keep extending.`, 3, i + 1);
        continue;
      }
      out.push(dict.get(w)!);
      dict.set(w + c, dict.size);
      yield frame(`“${[...(w + c)].map(show).join("")}” is new: output ${dict.get(w)} for “${[...w].map(show).join("")}” and add it as ${dict.size - 1}.`, 4, i + 1, w + c);
      w = c;
    }
    if (w) out.push(dict.get(w)!);
    yield frame(`Output ${dict.get(w)} for the last phrase. ${out.length} codes for ${data.length} characters.`, 5, data.length);
    const decoded = (() => {
      const table = [...alphabet];
      let previous = table[out[0]];
      let result = previous;
      for (const code of out.slice(1)) {
        const entry = code < table.length ? table[code] : previous + previous[0];
        result += entry;
        table.push(previous + entry[0]);
        previous = entry;
      }
      return out.length ? result : "";
    })();
    return { codes: out, decoded };
  },
});

function without_marker(spec: InputSpec<string>): InputSpec<string> {
  const message = "$ marks the end here, so the text can't contain it.";
  return {
    ...spec,
    schema: spec.schema.refine((value) => !value.includes("$"), message),
    parse: (value) => {
      if (value.includes("$")) throw new InputError(message);
      return spec.parse(value);
    },
  };
}

function bwt(data: string): { rotations: string[]; last: string } {
  const source = data + "$";
  const rotations = [...source].map((_, i) => source.slice(i) + source.slice(0, i)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { rotations, last: rotations.map((rotation) => rotation.at(-1)).join("") };
}

export function inverse_bwt(last: string): string {
  const table = [...last].map((char, i) => ({ char, i }));
  const sorted = [...table].sort((a, b) => (a.char < b.char ? -1 : a.char > b.char ? 1 : a.i - b.i));
  let at = sorted.findIndex((entry) => entry.char === "$");
  let out = "";
  for (let n = 0; n < last.length - 1; n++) {
    at = sorted[at].i;
    out += sorted[at].char;
  }
  return out;
}

const bwt_mtf = define({
  intro:
    "The Burrows–Wheeler transform sorts every rotation of the text and keeps the last column. That column groups equal characters together (lots of runs) and, with the end marker $, can be undone exactly. Move-to-front then turns those runs into many small numbers, mostly zeros, which a later entropy coder squeezes well.",
  use: "bzip2, and FM-indexes that let genome aligners (BWA, Bowtie) search huge texts in compressed form.",
  traits: ["Reversible", "Not compression by itself", "Groups equal characters"],
  pseudocode: [
    "add an end marker $; write every rotation of the text",
    "sort the rotations",
    "BWT ← the last column",
    "move-to-front: list ← the alphabet in order",
    "  for each character: output its position in the list, then move it to the front",
  ],
  input: without_marker(text({ sample: "banana", max_length: 20, alphabet: "anb", random_length: 10, hint: "Text without $, up to 20 characters" })),
  presets: [
    { label: "banana", value: "banana" },
    { label: "mississippi", value: "mississippi" },
    { label: "abracadabra", value: "abracadabra" },
  ],
  *run(data: string): Generator<Step, { last: string; codes: number[]; original: string }> {
    const source = data + "$";
    const unsorted = [...source].map((_, i) => source.slice(i) + source.slice(0, i));
    const table = (rows: string[], last_tone = false, marks: Record<number, Tone> = {}): View =>
      grid({ title: "rotations", rows: rows.map((rotation, r) => [...rotation].map((char, c) => ({ text: show(char), tone: marks[r] ?? (last_tone && c === rotation.length - 1 ? Tone.DONE : undefined) }))) });
    yield { views: [table(unsorted)], line: 0, note: `Add $ as the end marker and write all ${source.length} rotations.`, counters: { length: source.length } };
    const { rotations, last } = bwt(data);
    const original = rotations.indexOf(source);
    yield { views: [table(rotations, false, { [original]: Tone.MARK })], line: 1, note: `Sort them. The original text is row ${original}.`, counters: { length: source.length } };
    yield { views: [table(rotations, true)], line: 2, note: `The last column is the transform: ${[...last].map(show).join("")}. Equal characters now sit next to each other more often.`, counters: { length: source.length } };
    const alphabet = [...new Set(last)].sort();
    const list = [...alphabet];
    const codes: number[] = [];
    for (const [i, char] of [...last].entries()) {
      const position = list.indexOf(char);
      codes.push(position);
      list.splice(position, 1);
      list.unshift(char);
      yield {
        views: [
          chars_view(last, { ...range_tones(0, i, Tone.MUTED), [i]: Tone.ACTIVE }, "BWT"),
          grid({ title: "move-to-front list", rows: [list.map((symbol, k) => ({ text: show(symbol), tone: k === 0 ? Tone.WARN : undefined }))] }),
          { kind: "text", title: "output", lines: codes.map((code) => ({ text: String(code), tone: code === 0 ? Tone.DONE : undefined })) },
        ],
        line: 4,
        note: `“${show(char)}” is at position ${position}: output ${position}${position === 0 ? " (it was just used)" : ""} and move it to the front.`,
        counters: { zeros: codes.filter((code) => code === 0).length, outputs: codes.length },
      };
    }
    yield {
      views: [chars_view(last, {}, "BWT"), { kind: "text", title: "move-to-front output", lines: codes.map((code) => ({ text: String(code), tone: code === 0 ? Tone.DONE : undefined })) }],
      line: -1,
      note: `${codes.filter((code) => code === 0).length} of ${codes.length} outputs are 0. Undoing the transform gives “${inverse_bwt(last)}” back.`,
      counters: { zeros: codes.filter((code) => code === 0).length, outputs: codes.length },
    };
    return { last, codes, original: inverse_bwt(last) };
  },
});

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const base64 = define({
  intro:
    "Base64 writes any bytes using 64 safe characters. It takes 3 bytes (24 bits) at a time and cuts them into four 6-bit numbers, each picking one character from A–Z, a–z, 0–9, + and /. A last group of 1 or 2 bytes is padded with zero bits and marked with = signs. The output is a third bigger than the input.",
  use: "Binary data inside text: email attachments (MIME), data: URLs, JSON and JWT payloads, basic auth headers.",
  traits: ["Encoding, not compression", "+33% size"],
  pseudocode: [
    "bytes ← the text as UTF-8",
    "for each group of 3 bytes (24 bits):",
    "  cut into four 6-bit numbers",
    "  each number picks a character from the table",
    "a short last group: pad with zero bits, then = for each missing byte",
  ],
  input: text({ sample: "Hi WebOS!", max_length: 30, alphabet: "abcxyz ", random_length: 8, hint: "Text to encode, up to 30 characters" }),
  presets: [
    { label: "Sample", value: "Hi WebOS!" },
    { label: "Needs ==", value: "a" },
    { label: "Unicode", value: "čšž ✓" },
  ],
  *run(data: string) {
    const bytes = [...new TextEncoder().encode(data)];
    const out: string[] = [];
    const bits = (value: number, width: number) => value.toString(2).padStart(width, "0");
    const frame = (note: string, line: number, active = -1, pieces?: View): Step => ({
      views: [
        grid({
          title: "UTF-8 bytes",
          col_labels: bytes.map((_, i) => String(i)),
          rows: [bytes.map((byte, i) => ({ text: byte.toString(16).padStart(2, "0"), tone: Math.floor(i / 3) === active ? Tone.ACTIVE : Math.floor(i / 3) < active ? Tone.MUTED : undefined }))],
        }),
        ...(pieces ? [pieces] : []),
        { kind: "text", title: "Base64", lines: [{ text: out.join("") || "…", tone: out.length ? Tone.DONE : Tone.MUTED }] },
      ],
      line,
      note,
      counters: { bytes: bytes.length, characters: out.length },
    });
    yield frame(`“${data}” is ${bytes.length} bytes in UTF-8.`, 0);
    for (let g = 0; g * 3 < bytes.length; g++) {
      const group = bytes.slice(g * 3, g * 3 + 3);
      const padded = [...group, 0, 0].slice(0, 3);
      const joined = padded.map((byte) => bits(byte, 8)).join("");
      const sextets = [0, 1, 2, 3].map((k) => Number.parseInt(joined.slice(k * 6, k * 6 + 6), 2));
      const used = group.length + 1;
      const chars = sextets.map((value, k) => (k < used ? BASE64[value] : "="));
      yield frame(
        `Group ${g + 1}: ${group.map((byte) => bits(byte, 8)).join(" ")}${group.length < 3 ? ` + ${(3 - group.length) * 8} zero bits` : ""}.`,
        1,
        g,
        grid({ title: "6-bit pieces", rows: [sextets.map((value, k) => ({ text: k < used ? bits(value, 6) : "——", tone: k < used ? Tone.COMPARE : Tone.MUTED }))] })
      );
      out.push(...chars);
      yield frame(
        `The pieces ${sextets.slice(0, used).join(", ")} pick ${chars.slice(0, used).join("")}${used < 4 ? `, and ${4 - used} = ${4 - used === 1 ? "pads" : "pad"} the missing ${3 - group.length === 1 ? "byte" : "bytes"}` : ""}.`,
        used < 4 ? 4 : 3,
        g,
        grid({ title: "6-bit pieces → characters", rows: [sextets.map((value, k) => ({ text: k < used ? `${value} → ${BASE64[value]}` : "=", tone: k < used ? Tone.DONE : Tone.MUTED }))] })
      );
    }
    yield frame(`Done: ${bytes.length} bytes became ${out.length} characters.`, -1);
    return { encoded: out.join("") };
  },
});

export default {
  rle,
  lz77,
  lz78,
  lzw,
  "bwt-mtf": bwt_mtf,
  base64,
  "huffman-coding": entropy.huffman,
} as unknown as Record<string, Definition>;
