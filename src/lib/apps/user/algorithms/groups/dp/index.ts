import { z } from "zod";
import { define, type Definition } from "../../engine/definition";
import { fields, InputError, numbers, number_list, random_int, whole } from "../../engine/inputs";
import { grid, Tone, type Cell, type Step, type View } from "../../engine/step";
import { pair_spec, type Pair } from "../../engine/pair";

type Mark = [number, number, Tone];

function table_view(title: string, rows: (number | string | null)[][], row_labels: string[], col_labels: string[], marks: Mark[] = []): View {
  return grid({
    title,
    row_labels,
    col_labels,
    rows: rows.map((row, i) => row.map((value, j): Cell => ({ text: value === null ? "" : value === Infinity ? "∞" : String(value), tone: marks.find(([r, c]) => r === i && c === j)?.[2] }))),
  });
}

const lcs = define({
  intro:
    "The longest common subsequence of two strings is the longest sequence of characters that appears in both in the same order, not necessarily next to each other. A table L[i][j] holds the answer for the first i and j characters: a match extends the diagonal by one, otherwise take the better of dropping a character from either string.",
  use: "diff and version control (which lines stayed), DNA comparison, plagiarism detection.",
  traits: ["Dynamic programming", "O(n·m)"],
  pseudocode: [
    "L[i][0] ← L[0][j] ← 0",
    "for each i, j:",
    "  a[i] = b[j]: L[i][j] ← L[i−1][j−1] + 1",
    "  else: L[i][j] ← max(L[i−1][j], L[i][j−1])",
    "walk back from L[n][m], taking the diagonal on matches",
  ],
  input: pair_spec({ sample: { a: "ABCBDAB", b: "BDCABA" }, hint: "ABCBDAB | BDCABA", names: ["first", "second"], max: [12, 12], alphabet: "ABCD" }),
  *run({ a, b }: Pair): Generator<Step, { length: number; sequence: string }> {
    const n = a.length;
    const m = b.length;
    const L: (number | null)[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)));
    const labels = { rows: ["", ...a], cols: ["", ...b] };
    let cells = 0;
    yield { views: [table_view("L[i][j]", L, labels.rows, labels.cols)], line: 0, note: "An empty string shares nothing: the first row and column are 0.", counters: { cells } };
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        cells++;
        if (a[i - 1] === b[j - 1]) {
          L[i][j] = L[i - 1][j - 1]! + 1;
          yield { views: [table_view("L[i][j]", L, labels.rows, labels.cols, [[i - 1, j - 1, Tone.COMPARE], [i, j, Tone.DONE]])], line: 2, note: `${a[i - 1]} = ${b[j - 1]}: one more than the diagonal, ${L[i][j]}.`, counters: { cells } };
        } else {
          L[i][j] = Math.max(L[i - 1][j]!, L[i][j - 1]!);
          yield { views: [table_view("L[i][j]", L, labels.rows, labels.cols, [[i - 1, j, Tone.COMPARE], [i, j - 1, Tone.COMPARE], [i, j, Tone.ACTIVE]])], line: 3, note: `${a[i - 1]} ≠ ${b[j - 1]}: the better of above (${L[i - 1][j]}) and left (${L[i][j - 1]}).`, counters: { cells } };
        }
      }
    }
    const path: Mark[] = [];
    let sequence = "";
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        path.push([i, j, Tone.DONE]);
        sequence = a[i - 1] + sequence;
        i--;
        j--;
      } else {
        path.push([i, j, Tone.MARK]);
        if (L[i - 1][j]! >= L[i][j - 1]!) i--;
        else j--;
      }
    }
    yield {
      views: [table_view("L[i][j]", L, labels.rows, labels.cols, path), { kind: "text", title: "common subsequence", lines: [{ text: sequence || "(empty)", tone: Tone.DONE }] }],
      line: 4,
      note: `The longest common subsequence has length ${L[n][m]}: “${sequence}”. Green cells are the matches on the way back.`,
      counters: { cells, length: L[n][m]! },
    };
    return { length: L[n][m]!, sequence };
  },
});

interface Knapsack extends Record<string, unknown> {
  weights: number[];
  values: number[];
  capacity: number;
}

const knapsack_input = fields<Knapsack>({
  sample: { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], capacity: 7 },
  hint: "weights: 1 3 4 5; values: 1 4 5 7; capacity: 7",
  schema: z.object({ weights: z.array(z.number().int().min(1).max(20)).min(1).max(8), values: z.array(z.number().int().min(0).max(99)).min(1).max(8), capacity: z.number().int().min(1).max(20) }).refine((value) => value.weights.length === value.values.length, "Give as many values as weights."),
  parse: (entries) => {
    const weights = number_list(entries.get("weights"), "weights");
    const values = number_list(entries.get("values"), "values");
    if (weights.length !== values.length) throw new InputError("Give as many values as weights.");
    if (weights.length > 8) throw new InputError("At most 8 items.");
    if (weights.some((w) => !Number.isInteger(w) || w < 1 || w > 20)) throw new InputError("Weights: whole numbers from 1 to 20.");
    if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 99)) throw new InputError("Values: whole numbers from 0 to 99.");
    return { weights, values, capacity: whole(entries.get("capacity"), "capacity", 1, 20) };
  },
  format: (value) => `weights: ${value.weights.join(" ")}; values: ${value.values.join(" ")}; capacity: ${value.capacity}`,
  random: () => {
    const count = random_int(3, 6);
    return { weights: Array.from({ length: count }, () => random_int(1, 7)), values: Array.from({ length: count }, () => random_int(1, 15)), capacity: random_int(6, 12) };
  },
});

const knapsack = define({
  intro:
    "Pick items to fit a weight limit with the most total value, each item taken or left whole. Greedy by value-per-weight can fail, so build a table: K[i][w] is the best value using the first i items with capacity w. Each item is either skipped (the cell above) or taken (its value plus the best for the weight that's left).",
  use: "Budget allocation, cargo loading, choosing features for a release, cutting stock; the pattern behind many 'choose a subset' problems.",
  traits: ["Dynamic programming", "O(n·W)", "Pseudo-polynomial"],
  pseudocode: [
    "K[0][w] ← 0",
    "for each item i, each capacity w:",
    "  skip it: K[i−1][w]",
    "  take it (if it fits): value[i] + K[i−1][w − weight[i]]",
    "  K[i][w] ← the larger",
    "walk back: where K changes from the row above, item i was taken",
  ],
  input: knapsack_input,
  *run({ weights, values, capacity }: Knapsack): Generator<Step, { best: number; items: number[] }> {
    const n = weights.length;
    const K: (number | null)[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: capacity + 1 }, () => (i === 0 ? 0 : null)));
    const rows = ["none", ...weights.map((w, i) => `#${i + 1} w${w} v${values[i]}`)];
    const cols = Array.from({ length: capacity + 1 }, (_, w) => String(w));
    let cells = 0;
    yield { views: [table_view("K[item][capacity]", K, rows, cols)], line: 0, note: "With no items, every capacity is worth 0.", counters: { cells } };
    for (let i = 1; i <= n; i++) {
      for (let w = 0; w <= capacity; w++) {
        cells++;
        const skip = K[i - 1][w]!;
        const fits = weights[i - 1] <= w;
        const take = fits ? values[i - 1] + K[i - 1][w - weights[i - 1]]! : -1;
        K[i][w] = Math.max(skip, take);
        const marks: Mark[] = [[i - 1, w, Tone.COMPARE], ...(fits ? [[i - 1, w - weights[i - 1], Tone.COMPARE] as Mark] : []), [i, w, take > skip ? Tone.DONE : Tone.ACTIVE]];
        yield {
          views: [table_view("K[item][capacity]", K, rows, cols, marks)],
          line: take > skip ? 3 : 2,
          note: !fits ? `Item ${i} (weight ${weights[i - 1]}) doesn't fit in ${w}: copy ${skip} from above.` : take > skip ? `Taking item ${i} gives ${values[i - 1]} + ${K[i - 1][w - weights[i - 1]]} = ${take}, better than ${skip}.` : `Taking item ${i} gives ${take}; skipping keeps ${skip}.`,
          counters: { cells },
        };
      }
    }
    const items: number[] = [];
    const marks: Mark[] = [];
    let w = capacity;
    for (let i = n; i > 0; i--) {
      if (K[i][w] !== K[i - 1][w]) {
        items.unshift(i);
        marks.push([i, w, Tone.DONE]);
        w -= weights[i - 1];
      } else marks.push([i, w, Tone.MARK]);
    }
    const weight = items.reduce((sum, i) => sum + weights[i - 1], 0);
    yield {
      views: [table_view("K[item][capacity]", K, rows, cols, marks), { kind: "text", title: "taken", lines: items.length ? items.map((i) => ({ text: `#${i}: weight ${weights[i - 1]}, value ${values[i - 1]}`, tone: Tone.DONE })) : [{ text: "nothing fits", tone: Tone.MUTED }] }],
      line: 5,
      note: `Best value ${K[n][capacity]} at weight ${weight} of ${capacity}: items ${items.join(", ") || "none"}.`,
      counters: { cells, best: K[n][capacity]! },
    };
    return { best: K[n][capacity]!, items };
  },
});

interface Coins extends Record<string, unknown> {
  coins: number[];
  amount: number;
}

const coins_input = fields<Coins>({
  sample: { coins: [1, 3, 4], amount: 6 },
  hint: "coins: 1 3 4; amount: 6",
  schema: z.object({ coins: z.array(z.number().int().min(1).max(50)).min(1).max(6), amount: z.number().int().min(1).max(40) }),
  parse: (entries) => {
    const coins = number_list(entries.get("coins"), "coins");
    if (coins.length > 6 || coins.some((c) => !Number.isInteger(c) || c < 1 || c > 50)) throw new InputError("Up to 6 coins, each from 1 to 50.");
    return { coins: [...new Set(coins)].sort((x, y) => x - y), amount: whole(entries.get("amount"), "amount", 1, 40) };
  },
  format: (value) => `coins: ${value.coins.join(" ")}; amount: ${value.amount}`,
  random: () => ({ coins: [...new Set([1, random_int(2, 6), random_int(5, 12)])].sort((x, y) => x - y), amount: random_int(8, 30) }),
});

const coin_change = define({
  intro:
    "Make an amount with the fewest coins. Always grabbing the biggest coin works for euros but not for every coin set (with 1, 3 and 4, greedy pays 6 as 4 + 1 + 1, but 3 + 3 is better). Dynamic programming finds the true minimum: the best for amount a is one coin plus the best for a minus that coin, over every coin.",
  use: "Change-making, and the template for 'fewest steps to reach a target' problems.",
  traits: ["Dynamic programming", "O(amount · coins)"],
  pseudocode: ["best[0] ← 0; best[a] ← ∞", "for a from 1 to amount:", "  for each coin c ≤ a:", "    best[a] ← min(best[a], best[a − c] + 1)", "walk back through the chosen coins"],
  input: coins_input,
  presets: [
    { label: "Greedy fails", value: { coins: [1, 3, 4], amount: 6 } },
    { label: "Euro coins", value: { coins: [1, 2, 5, 10, 20, 50], amount: 38 } },
    { label: "No solution", value: { coins: [4, 6], amount: 15 } },
  ],
  *run({ coins, amount }: Coins): Generator<Step, { count: number | null; used: number[] }> {
    const best = new Array<number>(amount + 1).fill(Infinity);
    const via = new Array<number>(amount + 1).fill(0);
    best[0] = 0;
    let checks = 0;
    const view = (marks: Mark[] = []) => table_view("fewest coins for each amount", [best.map((value, a) => (a === 0 || value !== Infinity || marks.some(([, c]) => c === a) ? value : null))], ["coins"], best.map((_, a) => String(a)), marks);
    yield { views: [view()], line: 0, note: "Amount 0 needs no coins; everything else starts at ∞.", counters: { checks } };
    for (let a = 1; a <= amount; a++) {
      for (const c of coins) {
        if (c > a) continue;
        checks++;
        if (best[a - c] + 1 < best[a]) {
          best[a] = best[a - c] + 1;
          via[a] = c;
          yield { views: [view([[0, a - c, Tone.COMPARE], [0, a, Tone.WARN]])], line: 3, note: `${a}: a ${c} coin on top of ${a - c} (${best[a - c]} coins) makes ${best[a]}.`, counters: { checks } };
        }
      }
      if (best[a] === Infinity) yield { views: [view([[0, a, Tone.BAD]])], line: 2, note: `${a} can't be made with these coins.`, counters: { checks } };
    }
    if (best[amount] === Infinity) {
      yield { views: [view([[0, amount, Tone.BAD]])], line: -1, note: `${amount} can't be made from ${coins.join(", ")}.`, counters: { checks } };
      return { count: null, used: [] };
    }
    const used: number[] = [];
    const marks: Mark[] = [];
    for (let a = amount; a > 0; a -= via[a]) {
      used.push(via[a]);
      marks.push([0, a, Tone.DONE]);
    }
    yield { views: [view(marks), { kind: "text", title: "coins", lines: used.map((c) => ({ text: String(c), tone: Tone.DONE })) }], line: 4, note: `${amount} = ${used.join(" + ")}: ${used.length} coins.`, counters: { checks, coins: used.length } };
    return { count: used.length, used };
  },
});

const lis = define({
  intro:
    "The longest increasing subsequence is the longest run of values, in order but not necessarily adjacent, that keeps going up. For each position, len[i] is 1 plus the best len[j] of any earlier, smaller value. The largest len is the answer, and remembering which j gave it rebuilds the sequence.",
  use: "Patience sorting, version ordering, box-stacking and scheduling problems, and diff algorithms (patience diff).",
  traits: ["Dynamic programming", "O(n²)"],
  pseudocode: ["len[i] ← 1 for every i", "for each i, for each j < i:", "  a[j] < a[i] and len[j] + 1 > len[i]: len[i] ← len[j] + 1, prev[i] ← j", "the answer ends at the largest len; follow prev back"],
  input: numbers({ sample: [3, 10, 2, 1, 20, 4, 6, 7, 30, 5, 8], max_count: 20, min: 0, max: 99, random_count: 12 }),
  *run(values: number[]): Generator<Step, { length: number; sequence: number[] }> {
    const n = values.length;
    const len = new Array(n).fill(1);
    const prev = new Array(n).fill(-1);
    let comparisons = 0;
    const view = (marks: Record<number, Tone> = {}, len_marks: Record<number, Tone> = {}): View[] => [
      { kind: "bars", values, tones: marks },
      grid({ title: "len", col_labels: values.map(String), rows: [len.map((value, i) => ({ text: String(value), tone: len_marks[i] }))] }),
    ];
    yield { views: view(), line: 0, note: "Every value on its own is an increasing sequence of length 1.", counters: { comparisons } };
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        comparisons++;
        if (values[j] < values[i] && len[j] + 1 > len[i]) {
          len[i] = len[j] + 1;
          prev[i] = j;
          yield { views: view({ [j]: Tone.COMPARE, [i]: Tone.WARN }, { [i]: Tone.WARN }), line: 2, note: `${values[j]} < ${values[i]}: extend its sequence of ${len[j]} to ${len[i]}.`, counters: { comparisons } };
        }
      }
    }
    let end = 0;
    for (let i = 1; i < n; i++) if (len[i] > len[end]) end = i;
    const chain: number[] = [];
    for (let i = end; i >= 0; i = prev[i]) chain.unshift(i);
    const sequence = chain.map((i) => values[i]);
    yield {
      views: [...view(Object.fromEntries(values.map((_, i) => [i, chain.includes(i) ? Tone.DONE : Tone.MUTED])), { [end]: Tone.DONE }), { kind: "text", title: "subsequence", lines: [{ text: sequence.join(" < "), tone: Tone.DONE }] }],
      line: 3,
      note: `Length ${len[end]}: ${sequence.join(", ")}.`,
      counters: { comparisons, length: len[end] },
    };
    return { length: len[end], sequence };
  },
});

const matrix_chain = define({
  intro:
    "Multiplying matrices A·B·C gives the same result in any grouping, but the cost doesn't: (A·B)·C can take far fewer multiplications than A·(B·C). With dimensions p0 × p1, p1 × p2, …, cost[i][j] is the cheapest way to multiply matrices i to j: try every split point k, add both halves and the final product's p[i−1]·p[k]·p[j].",
  use: "Query planners ordering joins, compilers ordering arithmetic, and the textbook interval-DP problem.",
  traits: ["Dynamic programming", "O(n³)", "Interval DP"],
  pseudocode: ["cost[i][i] ← 0", "for each chain length L from 2 to n:", "  for each i with j = i + L − 1:", "    cost[i][j] ← min over k of cost[i][k] + cost[k+1][j] + p[i−1]·p[k]·p[j]", "rebuild the brackets from the best k"],
  input: numbers({ sample: [10, 30, 5, 60, 10], min_count: 3, max_count: 8, min: 1, max: 99, random_count: 6, hint: "Dimensions p0 p1 … pn: matrix i is p(i−1) × p(i)" }),
  *run(p: number[]): Generator<Step, { cost: number; order: string }> {
    const n = p.length - 1;
    const cost: (number | null)[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : null)));
    const split: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    const names = Array.from({ length: n }, (_, i) => `${String.fromCharCode(65 + i)} ${p[i]}×${p[i + 1]}`);
    let tries = 0;
    const view = (marks: Mark[] = []) => table_view("cost[i][j]", cost, names, names.map((name) => name.split(" ")[0]), marks);
    yield { views: [view()], line: 0, note: `${n} matrices. A single matrix costs nothing.`, counters: { tries } };
    for (let L = 2; L <= n; L++) {
      for (let i = 0; i + L - 1 < n; i++) {
        const j = i + L - 1;
        let best = Infinity;
        for (let k = i; k < j; k++) {
          tries++;
          const c = cost[i][k]! + cost[k + 1][j]! + p[i] * p[k + 1] * p[j + 1];
          if (c < best) {
            best = c;
            split[i][j] = k;
          }
        }
        cost[i][j] = best;
        const k = split[i][j];
        yield {
          views: [view([[i, k, Tone.COMPARE], [k + 1, j, Tone.COMPARE], [i, j, Tone.DONE]])],
          line: 3,
          note: `${names[i].split(" ")[0]}…${names[j].split(" ")[0]}: split after ${names[k].split(" ")[0]}, ${cost[i][k]} + ${cost[k + 1][j]} + ${p[i]}·${p[k + 1]}·${p[j + 1]} = ${best}.`,
          counters: { tries },
        };
      }
    }
    const bracket = (i: number, j: number): string => (i === j ? String.fromCharCode(65 + i) : `(${bracket(i, split[i][j])}·${bracket(split[i][j] + 1, j)})`);
    const order = bracket(0, n - 1);
    yield { views: [view([[0, n - 1, Tone.DONE]]), { kind: "text", title: "best order", lines: [{ text: order, tone: Tone.DONE }] }], line: 4, note: `Best: ${order}, ${cost[0][n - 1]} multiplications.`, counters: { tries, cost: cost[0][n - 1]! } };
    return { cost: cost[0][n - 1]!, order };
  },
});

export default {
  lcs,
  knapsack,
  "coin-change": coin_change,
  lis,
  "matrix-chain": matrix_chain,
} as unknown as Record<string, Definition>;

