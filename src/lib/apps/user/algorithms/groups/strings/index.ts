import { define, type Definition } from "../../engine/definition";
import { text } from "../../engine/inputs";
import { pair_spec, type Pair } from "../../engine/pair";
import { grid, range_tones, Tone, type Cell, type Step, type Tones, type View } from "../../engine/step";

export type { Pair };

const show = (char: string | undefined) => (char === undefined ? "" : char === " " ? "␣" : char);

const search_spec = (sample: Pair) => pair_spec({ sample, hint: "abab | abcababab", names: ["pattern", "text"], max: [12, 48], alphabet: "abc" });

function alignment(text_value: string, pattern: string, shift: number, text_tones: Tones, pattern_tones: Tones, title = "text and pattern"): View {
  return grid({
    title,
    row_labels: ["text", "pattern"],
    col_labels: [...text_value].map((_, i) => String(i)),
    rows: [
      [...text_value].map((char, i): Cell => ({ text: show(char), tone: text_tones[i] })),
      [...text_value].map((_, i): Cell | null => (i >= shift && i < shift + pattern.length ? { text: show(pattern[i - shift]), tone: pattern_tones[i - shift] } : null)),
    ],
  });
}

function matches_of(text_value: string, pattern: string): number[] {
  const found: number[] = [];
  for (let i = 0; i + pattern.length <= text_value.length; i++) if (text_value.startsWith(pattern, i)) found.push(i);
  return found;
}

const found_view = (found: number[]): View => ({ kind: "text", title: "matches at", lines: found.length ? found.map((at) => ({ text: String(at), tone: Tone.DONE })) : [{ text: "none yet", tone: Tone.MUTED }] });

const naive = define({
  intro:
    "Slide the pattern along the text one position at a time and compare character by character until a mismatch or a full match. Simple and needs no setup, but on repetitive text it re-reads the same characters again and again: O(n·m) in the worst case.",
  use: "Short patterns and small texts; what most standard library find functions do for short needles.",
  traits: ["No preprocessing", "O(n·m) worst case"],
  pseudocode: ["for s from 0 to n − m:", "  j ← 0", "  while j < m and text[s + j] = pattern[j]: j ← j + 1", "  if j = m: report a match at s"],
  input: search_spec({ a: "abab", b: "abcabababcabab" }),
  presets: [{ label: "Worst case", value: { a: "aaab", b: "aaaaaaaaaaaaaaab" } }],
  *run({ a: pattern, b: text_value }: Pair) {
    const found: number[] = [];
    let comparisons = 0;
    const frame = (note: string, line: number, shift: number, text_tones: Tones = {}, pattern_tones: Tones = {}): Step => ({
      views: [alignment(text_value, pattern, shift, text_tones, pattern_tones), found_view(found)],
      line,
      note,
      counters: { comparisons, shifts: shift + 1 },
    });
    for (let s = 0; s + pattern.length <= text_value.length; s++) {
      let j = 0;
      while (j < pattern.length) {
        comparisons++;
        const same = text_value[s + j] === pattern[j];
        yield frame(
          same ? `${show(text_value[s + j])} = ${show(pattern[j])}.` : `${show(text_value[s + j])} ≠ ${show(pattern[j])}: shift the pattern by one.`,
          2,
          s,
          { ...range_tones(s, s + j, Tone.DONE), [s + j]: same ? Tone.DONE : Tone.BAD },
          { ...range_tones(0, j, Tone.DONE), [j]: same ? Tone.DONE : Tone.BAD }
        );
        if (!same) break;
        j++;
      }
      if (j === pattern.length) {
        found.push(s);
        yield frame(`All ${pattern.length} characters match: a match at ${s}.`, 3, s, range_tones(s, s + pattern.length, Tone.DONE), range_tones(0, pattern.length, Tone.DONE));
      }
    }
    yield frame(`Done: ${found.length} ${found.length === 1 ? "match" : "matches"} with ${comparisons} comparisons.`, -1, Math.max(0, text_value.length - pattern.length));
    return { found };
  },
});

export function failure_table(pattern: string): number[] {
  const fail = new Array(pattern.length).fill(0);
  let k = 0;
  for (let i = 1; i < pattern.length; i++) {
    while (k > 0 && pattern[i] !== pattern[k]) k = fail[k - 1];
    if (pattern[i] === pattern[k]) k++;
    fail[i] = k;
  }
  return fail;
}

const kmp = define({
  intro:
    "Knuth–Morris–Pratt never moves backwards in the text. First it computes, for every prefix of the pattern, how long its longest proper prefix that is also a suffix is (the failure table). On a mismatch after j matched characters, those characters are known, so the pattern jumps to the longest border instead of starting over. O(n + m) always.",
  use: "Streaming search where you can't re-read input, and repetitive patterns; the failure table also shows up in compression and DNA tools.",
  traits: ["O(n + m)", "Never backs up in the text"],
  pseudocode: [
    "fail[i] ← length of the longest border of pattern[0..i]",
    "j ← 0",
    "for i over the text:",
    "  while j > 0 and text[i] ≠ pattern[j]: j ← fail[j − 1]",
    "  if text[i] = pattern[j]: j ← j + 1",
    "  if j = m: report a match at i − m + 1; j ← fail[j − 1]",
  ],
  input: search_spec({ a: "ababc", b: "abababcababababc" }),
  presets: [{ label: "Worst case for naive", value: { a: "aaab", b: "aaaaaaaaaaaaaaab" } }],
  *run({ a: pattern, b: text_value }: Pair) {
    const fail = failure_table(pattern);
    const found: number[] = [];
    let comparisons = 0;
    const table = (mark?: number): View =>
      grid({ title: "failure table", col_labels: [...pattern].map(show), rows: [fail.map((value, i) => ({ text: String(value), tone: i === mark ? Tone.ACTIVE : undefined }))] });
    const frame = (note: string, line: number, shift: number, matched: number, current: number | null, mark?: number): Step => ({
      views: [
        alignment(
          text_value,
          pattern,
          shift,
          { ...range_tones(shift, shift + matched, Tone.DONE), ...(current === null ? {} : { [current]: Tone.BAD }) },
          { ...range_tones(0, matched, Tone.DONE), ...(current === null ? {} : { [current - shift]: Tone.BAD }) }
        ),
        table(mark),
        found_view(found),
      ],
      line,
      note,
      counters: { comparisons, matched },
    });
    yield {
      views: [table(), alignment(text_value, pattern, 0, {}, {})],
      line: 0,
      note: `Failure table: after a mismatch with j characters matched, carry on from fail[j − 1] instead of 0. For “${pattern}” it is ${fail.join(", ")}.`,
      counters: { comparisons },
    };
    let j = 0;
    for (let i = 0; i < text_value.length; i++) {
      while (j > 0 && text_value[i] !== pattern[j]) {
        comparisons++;
        yield frame(`${show(text_value[i])} ≠ ${show(pattern[j])} after ${j} matched: fall back to fail[${j - 1}] = ${fail[j - 1]}. The text position stays.`, 3, i - j, j, i, j - 1);
        j = fail[j - 1];
      }
      comparisons++;
      if (text_value[i] === pattern[j]) {
        j++;
        yield frame(`${show(text_value[i])} = ${show(pattern[j - 1])}: ${j} matched.`, 4, i - j + 1, j, null);
      } else yield frame(`${show(text_value[i])} ≠ ${show(pattern[0])}: move on.`, 4, i, 0, i);
      if (j === pattern.length) {
        found.push(i - pattern.length + 1);
        yield frame(`All ${pattern.length} matched: a match at ${i - pattern.length + 1}. Continue from fail[${j - 1}] = ${fail[j - 1]}.`, 5, i - j + 1, j, null, j - 1);
        j = fail[j - 1];
      }
    }
    yield { views: [alignment(text_value, pattern, Math.max(0, text_value.length - pattern.length), {}, {}), table(), found_view(found)], line: -1, note: `Done: ${found.length} ${found.length === 1 ? "match" : "matches"} with ${comparisons} comparisons.`, counters: { comparisons } };
    return { found };
  },
});

export function good_suffix_shifts(pattern: string): number[] {
  const m = pattern.length;
  const shifts = Array<number>(m + 1).fill(0);
  const border = Array<number>(m + 1).fill(0);
  let i = m;
  let j = m + 1;
  border[i] = j;
  while (i > 0) {
    while (j <= m && pattern[i - 1] !== pattern[j - 1]) {
      if (shifts[j] === 0) shifts[j] = j - i;
      j = border[j];
    }
    i--;
    j--;
    border[i] = j;
  }
  j = border[0];
  for (i = 0; i <= m; i++) {
    if (shifts[i] === 0) shifts[i] = j;
    if (i === j) j = border[j];
  }
  return shifts;
}

const boyer_moore = define({
  intro:
    "Boyer–Moore compares the pattern right to left and, on a mismatch, slides it by the larger of two rules. The bad-character rule looks up where the mismatched text character last occurs in the pattern and lines them up, or jumps right past it. The good-suffix rule uses the part that already matched: it slides to the next copy of that suffix in the pattern (one not preceded by the same mismatching character), or to the longest prefix that fits its end. On normal text that skips most characters: the longer the pattern, the faster it gets.",
  use: "Search in editors and grep-like tools (GNU grep uses a Boyer–Moore variant); long patterns over a large alphabet. The good-suffix rule matters on small alphabets like DNA, where bad characters rarely help.",
  traits: ["Right to left", "Skips ahead", "Sub-linear on typical text"],
  pseudocode: [
    "last[c] ← the last index of c in the pattern, or −1",
    "good[j] ← the smallest slide that lines the matched suffix after j up again, not preceded by pattern[j]",
    "s ← 0",
    "while s ≤ n − m:",
    "  j ← m − 1; while j ≥ 0 and pattern[j] = text[s + j]: j ← j − 1",
    "  j < 0: a match at s; s ← s + good[full match]",
    "  bad ← j − last[text[s + j]]; suffix ← good[j]",
    "  s ← s + max(1, bad, suffix)",
  ],
  input: search_spec({ a: "example", b: "here is a simple example" }),
  presets: [
    { label: "Good suffix wins", value: { a: "abbabab", b: "abaabbababbabababbabab" } },
    { label: "Repetitive", value: { a: "abab", b: "abababababcababab" } },
  ],
  params: [
    {
      id: "rules",
      label: "Rules",
      kind: "choice",
      choices: [
        { value: "both", label: "Bad character + good suffix" },
        { value: "bad", label: "Bad character only" },
        { value: "good", label: "Good suffix only" },
      ],
      default: "both",
    },
  ],
  *run({ a: pattern, b: text_value }: Pair, params) {
    const rules = String(params.rules ?? "both");
    const use_bad = rules !== "good";
    const use_good = rules !== "bad";
    const m = pattern.length;
    const last = new Map<string, number>();
    [...pattern].forEach((char, i) => last.set(char, i));
    const good = good_suffix_shifts(pattern);
    const found: number[] = [];
    let comparisons = 0;
    const last_table = (mark?: string): View =>
      grid({ title: "bad character: last occurrence", col_labels: [...last.keys()].map(show), rows: [[...last.entries()].map(([char, i]) => ({ text: String(i), tone: char === mark ? Tone.ACTIVE : undefined }))] });
    const good_table = (mark?: number): View =>
      grid({
        title: `good suffix: slide on a mismatch at j (full match: ${good[0]})`,
        col_labels: [...pattern].map((char, j) => `${j} ${show(char)}`),
        rows: [[...pattern].map((_, j) => ({ text: String(good[j + 1]), tone: j === mark ? Tone.ACTIVE : undefined }))],
      });
    const frame = (note: string, line: number, s: number, text_tones: Tones, pattern_tones: Tones, mark?: { char?: string; j?: number }): Step => ({
      views: [
        alignment(text_value, pattern, s, text_tones, pattern_tones),
        ...(use_bad ? [last_table(mark?.char)] : []),
        ...(use_good ? [good_table(mark?.j)] : []),
        found_view(found),
      ],
      line,
      note,
      counters: { comparisons, "shift position": s },
    });
    if (use_bad) yield frame(`Bad-character table: where each pattern character last occurs.`, 0, 0, {}, {});
    if (use_good)
      yield frame(
        `Good-suffix table: if the mismatch is at j, the suffix after j already matched; slide by good[j] so another copy of it (or a prefix that fits its end) lands under the same text.`,
        1,
        0,
        {},
        {}
      );
    let s = 0;
    while (s <= text_value.length - m) {
      let j = m - 1;
      while (j >= 0) {
        comparisons++;
        const same = pattern[j] === text_value[s + j];
        yield frame(same ? `${show(text_value[s + j])} = ${show(pattern[j])}, keep going left.` : `${show(text_value[s + j])} ≠ ${show(pattern[j])}.`, 4, s, { ...range_tones(s + j + 1, s + m, Tone.DONE), [s + j]: same ? Tone.DONE : Tone.BAD }, { ...range_tones(j + 1, m, Tone.DONE), [j]: same ? Tone.DONE : Tone.BAD });
        if (!same) break;
        j--;
      }
      if (j < 0) {
        found.push(s);
        const jump = use_good ? good[0] : 1;
        yield frame(
          use_good ? `A match at ${s}. The pattern overlaps itself at a slide of ${jump}, so move ${jump}.` : `A match at ${s}. Without the good-suffix rule, move 1.`,
          5,
          s,
          range_tones(s, s + m, Tone.DONE),
          range_tones(0, m, Tone.DONE)
        );
        s += jump;
        continue;
      }
      const char = text_value[s + j];
      const at = last.get(char) ?? -1;
      const bad = use_bad ? j - at : 0;
      const suffix = use_good ? good[j + 1] : 0;
      const jump = Math.max(1, bad, suffix);
      const parts: string[] = [];
      if (use_bad)
        parts.push(at < 0 ? `“${show(char)}” isn't in the pattern: bad character says ${bad}` : `the last “${show(char)}” is at ${at}: bad character says ${bad}${bad < 1 ? " (that would go backwards)" : ""}`);
      if (use_good) parts.push(j === m - 1 ? `nothing matched yet: good suffix says ${suffix}` : `“${pattern.slice(j + 1)}” matched: good suffix says ${suffix}`);
      const winner = use_bad && use_good ? (suffix > bad ? " The good suffix wins." : bad > suffix ? " The bad character wins." : "") : "";
      yield frame(
        `${parts.join("; ")}. Slide ${jump}.${winner}`.replace(/^./, (first) => first.toUpperCase()),
        7,
        s,
        { [s + j]: Tone.WARN, ...range_tones(s + j + 1, s + m, Tone.MARK) },
        { ...(use_bad && at >= 0 ? { [at]: Tone.WARN } : {}), ...range_tones(j + 1, m, Tone.MARK) },
        { char, j }
      );
      s += jump;
    }
    yield frame(`Done: ${found.length} ${found.length === 1 ? "match" : "matches"} with ${comparisons} comparisons for ${text_value.length} characters of text.`, -1, Math.max(0, Math.min(s, text_value.length - pattern.length)), {}, {});
    return { found };
  },
});

const rabin_karp = define({
  intro:
    "Rabin–Karp compares hashes instead of strings. It hashes the pattern once, then rolls a hash along the text: dropping the leftmost character and adding the next one takes O(1). Only when the hashes agree does it compare the actual characters, because different strings can share a hash (a spurious hit).",
  use: "Searching for many patterns at once, plagiarism detection, finding repeated substrings; the rolling-hash idea also powers rsync and content-defined chunking.",
  traits: ["Rolling hash", "Expected O(n + m)"],
  pseudocode: [
    "hp ← hash(pattern); ht ← hash(text[0..m))",
    "for s from 0 to n − m:",
    "  if ht = hp: compare the characters (it may be a spurious hit)",
    "  roll: ht ← (ht − text[s] · B^(m−1)) · B + text[s + m]  (mod q)",
  ],
  input: search_spec({ a: "cab", b: "abcabcbcabdcab" }),
  params: [{ id: "modulus", label: "Modulus q", kind: "number", min: 3, max: 101, default: 13 }],
  *run({ a: pattern, b: text_value }: Pair, params) {
    const q = Number(params.modulus ?? 13);
    const base = 31;
    const m = pattern.length;
    const code = (char: string) => char.charCodeAt(0) % q;
    const hash = (value: string) => [...value].reduce((h, char) => (h * base + code(char)) % q, 0);
    let power = 1;
    for (let i = 1; i < m; i++) power = (power * base) % q;
    const hp = hash(pattern);
    let ht = hash(text_value.slice(0, m));
    const found: number[] = [];
    let spurious = 0;
    let comparisons = 0;
    const frame = (note: string, line: number, s: number, tones: Tones, pattern_tones: Tones = {}): Step => ({
      views: [alignment(text_value, pattern, s, tones, pattern_tones), found_view(found)],
      line,
      note,
      counters: { "pattern hash": hp, "window hash": ht, "spurious hits": spurious, comparisons },
    });
    yield frame(`hash(“${pattern}”) = ${hp} (mod ${q}); the first window hashes to ${ht}.`, 0, 0, range_tones(0, m, Tone.MARK));
    for (let s = 0; s + m <= text_value.length; s++) {
      if (ht === hp) {
        let same = true;
        for (let j = 0; j < m; j++) {
          comparisons++;
          if (text_value[s + j] !== pattern[j]) {
            same = false;
            break;
          }
        }
        if (same) {
          found.push(s);
          yield frame(`Hashes agree at ${s} and the characters match: a real match.`, 2, s, range_tones(s, s + m, Tone.DONE), range_tones(0, m, Tone.DONE));
        } else {
          spurious++;
          yield frame(`Hashes agree at ${s}, but the characters differ: a spurious hit.`, 2, s, range_tones(s, s + m, Tone.BAD), range_tones(0, m, Tone.BAD));
        }
      } else yield frame(`Window at ${s} hashes to ${ht} ≠ ${hp}: skip without comparing.`, 1, s, range_tones(s, s + m, Tone.MARK));
      if (s + m < text_value.length) {
        const before = ht;
        ht = (((ht - ((code(text_value[s]) * power) % q) + q) % q) * base + code(text_value[s + m])) % q;
        yield frame(`Roll: drop “${show(text_value[s])}”, add “${show(text_value[s + m])}”: ${before} → ${ht}.`, 3, s + 1, { [s]: Tone.MUTED, ...range_tones(s + 1, s + m, Tone.MARK), [s + m]: Tone.WARN });
      }
    }
    yield frame(`Done: ${found.length} ${found.length === 1 ? "match" : "matches"}, ${spurious} spurious ${spurious === 1 ? "hit" : "hits"}. A bigger modulus means fewer false alarms.`, -1, Math.max(0, text_value.length - m), {});
    return { found, spurious };
  },
});

export function z_array(value: string): number[] {
  const n = value.length;
  const z_values = new Array(n).fill(0);
  let l = 0;
  let r = 0;
  for (let i = 1; i < n; i++) {
    if (i < r) z_values[i] = Math.min(r - i, z_values[i - l]);
    while (i + z_values[i] < n && value[z_values[i]] === value[i + z_values[i]]) z_values[i]++;
    if (i + z_values[i] > r) [l, r] = [i, i + z_values[i]];
  }
  return z_values;
}

const z_algorithm = define({
  intro:
    "The Z-array gives, for each position, how long the substring starting there matches the start of the string. Computed left to right, it reuses a window [l, r) that is known to match the prefix, so it's O(n). To search, run it on pattern + $ + text: wherever Z equals the pattern's length, the pattern occurs.",
  use: "Pattern search, finding periods and borders, and many competitive-programming string problems.",
  traits: ["O(n + m)", "Prefix matches"],
  pseudocode: [
    "s ← pattern + $ + text; l ← r ← 0",
    "for i from 1:",
    "  if i < r: z[i] ← min(r − i, z[i − l])  (reuse the known window)",
    "  while s[z[i]] = s[i + z[i]]: z[i] ← z[i] + 1",
    "  if i + z[i] > r: l ← i, r ← i + z[i]",
    "z[i] = m: the pattern occurs at i − m − 1 in the text",
  ],
  input: search_spec({ a: "aab", b: "baabaabaab" }),
  *run({ a: pattern, b: text_value }: Pair) {
    const s = `${pattern}$${text_value}`;
    const n = s.length;
    const z_values = new Array(n).fill(0);
    let l = 0;
    let r = 0;
    let comparisons = 0;
    const found: number[] = [];
    const frame = (note: string, line: number, i: number, tones: Tones = {}): Step => ({
      views: [
        grid({
          title: "pattern $ text",
          col_labels: [...s].map((_, k) => String(k)),
          row_labels: ["s", "z"],
          rows: [[...s].map((char, k) => ({ text: show(char), tone: tones[k] ?? (k === pattern.length ? Tone.MUTED : undefined) })), z_values.map((value, k) => ({ text: k === 0 ? "–" : k <= i ? String(value) : "", tone: k === i ? Tone.ACTIVE : value === pattern.length && k > pattern.length ? Tone.DONE : undefined }))],
          pointers: r > l ? [{ index: l, label: "l" }, { index: Math.min(n - 1, r - 1), label: "r" }] : [],
        }),
        found_view(found),
      ],
      line,
      note,
      counters: { comparisons },
    });
    yield frame(`Search “${pattern}” by computing the Z-array of “${s}”.`, 0, 0);
    for (let i = 1; i < n; i++) {
      if (i < r) {
        z_values[i] = Math.min(r - i, z_values[i - l]);
        yield frame(`${i} is inside the window [${l}, ${r}): start from z[${i - l}] = ${z_values[i - l]}, capped at ${r - i}.`, 2, i, { ...range_tones(l, r, Tone.MARK), [i - l]: Tone.COMPARE });
      }
      while (i + z_values[i] < n && s[z_values[i]] === s[i + z_values[i]]) {
        comparisons++;
        z_values[i]++;
      }
      if (i + z_values[i] < n) comparisons++;
      if (z_values[i] > 0) yield frame(`z[${i}] = ${z_values[i]}: “${s.slice(i, i + z_values[i])}” matches the start.`, 3, i, { ...range_tones(0, z_values[i], Tone.COMPARE), ...range_tones(i, i + z_values[i], Tone.DONE) });
      if (i + z_values[i] > r) [l, r] = [i, i + z_values[i]];
      if (z_values[i] === pattern.length && i > pattern.length) {
        found.push(i - pattern.length - 1);
        yield frame(`z[${i}] equals the pattern length: a match at ${i - pattern.length - 1} in the text.`, 5, i, range_tones(i, i + pattern.length, Tone.DONE));
      }
    }
    yield frame(`Done: ${found.length} ${found.length === 1 ? "match" : "matches"}.`, -1, n);
    return { found, z: z_values };
  },
});

const edit_distance = define({
  intro:
    "The edit (Levenshtein) distance is the fewest single-character insertions, deletions and substitutions that turn one string into another. A table d[i][j] holds the distance between the first i characters of one and the first j of the other; each cell is the cheapest of three neighbours plus one, or the diagonal for free when the characters match.",
  use: "Spell checkers and 'did you mean', fuzzy search, diff tools, DNA sequence alignment.",
  traits: ["Dynamic programming", "O(n·m)"],
  pseudocode: [
    "d[i][0] ← i; d[0][j] ← j",
    "for each i, j:",
    "  same character: d[i][j] ← d[i−1][j−1]",
    "  else: d[i][j] ← 1 + min(d[i−1][j] (delete), d[i][j−1] (insert), d[i−1][j−1] (replace))",
    "the answer is d[n][m]; follow the choices back for the edits",
  ],
  input: pair_spec({ sample: { a: "kitten", b: "sitting" }, hint: "kitten | sitting", names: ["from", "to"], max: [12, 12], alphabet: "abcde" }),
  *run({ a, b }: Pair): Generator<Step, { distance: number; edits: string[] }> {
    const n = a.length;
    const m = b.length;
    const d = Array.from({ length: n + 1 }, () => new Array<number | null>(m + 1).fill(null));
    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;
    const table = (marks: [number, number, Tone][] = []): View =>
      grid({
        title: "d[i][j]",
        row_labels: ["", ...[...a].map(show)],
        col_labels: ["", ...[...b].map(show)],
        rows: d.map((row, i) => row.map((value, j) => ({ text: value === null ? "" : String(value), tone: marks.find(([x, y]) => x === i && y === j)?.[2] }))),
      });
    yield { views: [table()], line: 0, note: "The first row and column: turning a prefix into the empty string takes that many deletions (or insertions).", counters: { cells: n + m + 1 } };
    let cells = n + m + 1;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        cells++;
        const same = a[i - 1] === b[j - 1];
        const options = [d[i - 1][j]! + 1, d[i][j - 1]! + 1, d[i - 1][j - 1]! + (same ? 0 : 1)];
        d[i][j] = Math.min(...options);
        yield {
          views: [table([[i - 1, j, Tone.COMPARE], [i, j - 1, Tone.COMPARE], [i - 1, j - 1, Tone.COMPARE], [i, j, Tone.ACTIVE]])],
          line: same ? 2 : 3,
          note: same
            ? `${show(a[i - 1])} = ${show(b[j - 1])}: take the diagonal, ${d[i][j]}.`
            : `${show(a[i - 1])} ≠ ${show(b[j - 1])}: 1 + min(${d[i - 1][j]}, ${d[i][j - 1]}, ${d[i - 1][j - 1]}) = ${d[i][j]}.`,
          counters: { cells },
        };
      }
    }
    const path: [number, number, Tone][] = [];
    const edits: string[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      path.push([i, j, Tone.DONE]);
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
        i--;
        j--;
      } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1]! + 1) {
        edits.unshift(`replace ${show(a[i - 1])} with ${show(b[j - 1])}`);
        i--;
        j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j]! + 1) {
        edits.unshift(`delete ${show(a[i - 1])}`);
        i--;
      } else {
        edits.unshift(`insert ${show(b[j - 1])}`);
        j--;
      }
    }
    path.push([0, 0, Tone.DONE]);
    yield {
      views: [table(path), { kind: "text", title: "edits", lines: edits.length ? edits.map((text) => ({ text, tone: Tone.WARN })) : [{ text: "none: the strings are equal", tone: Tone.DONE }] }],
      line: 4,
      note: `The distance from “${a}” to “${b}” is ${d[n][m]}. Following the choices back gives the edits.`,
      counters: { cells, distance: d[n][m]! },
    };
    return { distance: d[n][m]!, edits };
  },
});

const suffix_array = define({
  intro:
    "A suffix array lists the starting positions of all suffixes of a text in sorted order. Every occurrence of a pattern is a prefix of some suffix, and all of those suffixes sit next to each other in the sorted list, so a binary search finds them all. The LCP array next to it gives how much each suffix shares with the one before.",
  use: "Full-text indexes, genome search, data compression (it's how BWT is built), finding the longest repeated substring.",
  traits: ["Sorted suffixes", "Binary-searchable"],
  pseudocode: [
    "list every suffix with its start position",
    "sort them",
    "SA ← the start positions in sorted order",
    "LCP[k] ← length of the common prefix of suffixes SA[k − 1] and SA[k]",
  ],
  input: text({ sample: "banana", max_length: 20, alphabet: "anb", random_length: 10, hint: "Text, up to 20 characters" }),
  presets: [
    { label: "banana", value: "banana" },
    { label: "mississippi", value: "mississippi" },
  ],
  *run(value: string): Generator<Step, { sa: number[]; lcp: number[] }> {
    const suffixes = [...value].map((_, i) => ({ i, suffix: value.slice(i) }));
    const table = (list: { i: number; suffix: string }[], lcp?: number[], mark?: number): View =>
      grid({
        title: lcp ? "suffix array with LCP" : "suffixes",
        row_labels: list.map((entry) => String(entry.i)),
        rows: list.map((entry, k) => [...(lcp ? [{ text: String(lcp[k]), tone: k === mark ? Tone.ACTIVE : Tone.MUTED }] : []), ...[...entry.suffix].map((char, c): Cell => ({ text: show(char), tone: lcp && c < lcp[k] ? Tone.MARK : undefined }))]),
      });
    yield { views: [table(suffixes)], line: 0, note: `“${value}” has ${value.length} suffixes, labelled by where they start.`, counters: { suffixes: value.length } };
    const sorted = [...suffixes].sort((x, y) => (x.suffix < y.suffix ? -1 : x.suffix > y.suffix ? 1 : 0));
    yield { views: [table(sorted)], line: 1, note: "Sort them alphabetically.", counters: { suffixes: value.length } };
    const sa = sorted.map((entry) => entry.i);
    const lcp = sorted.map((entry, k) => {
      if (k === 0) return 0;
      const previous = sorted[k - 1].suffix;
      let n = 0;
      while (n < previous.length && n < entry.suffix.length && previous[n] === entry.suffix[n]) n++;
      return n;
    });
    for (let k = 1; k < sorted.length; k++) {
      yield { views: [table(sorted, lcp.map((x, idx) => (idx <= k ? x : 0)), k)], line: 3, note: `“${sorted[k - 1].suffix}” and “${sorted[k].suffix}” share ${lcp[k]} ${lcp[k] === 1 ? "character" : "characters"}.`, counters: { suffixes: value.length } };
    }
    const longest = Math.max(0, ...lcp);
    const at = lcp.indexOf(longest);
    yield {
      views: [table(sorted, lcp), grid({ title: "SA", rows: [sa.map((index) => ({ text: String(index), tone: Tone.DONE }))] })],
      line: 2,
      note: longest ? `SA = ${sa.join(", ")}. The largest LCP, ${longest}, gives the longest repeated substring: “${sorted[at].suffix.slice(0, longest)}”.` : `SA = ${sa.join(", ")}. No substring repeats.`,
      counters: { suffixes: value.length, "longest repeat": longest },
    };
    return { sa, lcp };
  },
});

export default {
  "naive-search": naive,
  kmp,
  "boyer-moore": boyer_moore,
  "rabin-karp": rabin_karp,
  "z-algorithm": z_algorithm,
  "edit-distance": edit_distance,
  "suffix-array": suffix_array,
} as unknown as Record<string, Definition>;

export { matches_of };
