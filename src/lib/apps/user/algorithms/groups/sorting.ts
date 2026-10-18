import { define, record, type Definition, type Preset } from "../engine/definition";
import { numbers } from "../engine/inputs";
import { cells, grid, range_tones, Tone, type BarsView, type Pointer, type Step, type Tones, type TreeNode, type View } from "../engine/step";

const SAMPLE = [38, 27, 43, 3, 9, 82, 10, 55, 21, 67, 14, 49];

function presets(count = 16): Preset<number[]>[] {
  const sorted = Array.from({ length: count }, (_, i) => (i + 1) * 5);
  const nearly = [...sorted];
  [nearly[3], nearly[4]] = [nearly[4], nearly[3]];
  [nearly[count - 3], nearly[count - 6]] = [nearly[count - 6], nearly[count - 3]];
  return [
    { label: "Sample", value: SAMPLE },
    { label: "Already sorted", value: sorted },
    { label: "Reversed", value: [...sorted].reverse() },
    { label: "Nearly sorted", value: nearly },
    { label: "Few unique", value: Array.from({ length: count }, (_, i) => [30, 10, 50, 20][(i * 7) % 4]) },
  ];
}

const quadratic = numbers({ sample: SAMPLE, max_count: 120, min: 0, max: 999, random_count: 16 });
const fast = numbers({ sample: SAMPLE, max_count: 400, min: 0, max: 999, random_count: 24 });

class Tracker {
  comparisons = 0;
  writes = 0;
  readonly done = new Set<number>();

  constructor(readonly a: number[]) {}

  less(i: number, j: number): boolean {
    this.comparisons++;
    return this.a[i] < this.a[j];
  }

  swap(i: number, j: number) {
    [this.a[i], this.a[j]] = [this.a[j], this.a[i]];
    this.writes += 2;
  }

  set(i: number, value: number) {
    this.a[i] = value;
    this.writes++;
  }

  bars(tones: Tones = {}, pointers?: Pointer[], title?: string): BarsView {
    const all: Tones = {};
    for (const index of this.done) all[index] = Tone.DONE;
    return { kind: "bars", title, values: [...this.a], tones: { ...all, ...tones }, pointers };
  }

  frame(note: string, line: number, tones: Tones = {}, options: { pointers?: Pointer[]; extra?: View[] } = {}): Step {
    return {
      views: [this.bars(tones, options.pointers), ...(options.extra ?? [])],
      line,
      note,
      counters: { comparisons: this.comparisons, writes: this.writes },
    };
  }

  finish(note = "Sorted."): Step {
    for (let i = 0; i < this.a.length; i++) this.done.add(i);
    return this.frame(note, -1);
  }
}

const cmp_note = (a: number, b: number, swap: string, keep: string) => (a > b ? `${a} > ${b}: ${swap}` : `${a} ≤ ${b}: ${keep}`);

const bubble = define({
  intro:
    "Walk the array comparing neighbours and swap any pair in the wrong order. After each pass the largest value left has bubbled to the end, so the sorted part grows from the right. Stop early when a pass makes no swaps.",
  use: "Teaching, and tiny or almost-sorted inputs. Everywhere else a better sort wins.",
  traits: ["Stable", "In place", "Adaptive"],
  pseudocode: [
    "for i from 0 to n − 2",
    "  swapped ← false",
    "  for j from 0 to n − i − 2",
    "    if a[j] > a[j + 1]",
    "      swap a[j], a[j + 1]; swapped ← true",
    "  if not swapped: stop",
  ],
  input: quadratic,
  presets: presets(),
  *run(input) {
    const t = new Tracker([...input]);
    const n = t.a.length;
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      yield t.frame(`Pass ${i + 1}: carry the largest of the first ${n - i} values to the end.`, 1);
      for (let j = 0; j < n - i - 1; j++) {
        const [x, y] = [t.a[j], t.a[j + 1]];
        const bigger = t.less(j + 1, j);
        yield t.frame(cmp_note(x, y, "out of order.", "already in order."), 3, { [j]: Tone.COMPARE, [j + 1]: Tone.COMPARE });
        if (bigger) {
          t.swap(j, j + 1);
          swapped = true;
          yield t.frame(`Swap ${x} and ${y}.`, 4, { [j]: Tone.WARN, [j + 1]: Tone.WARN });
        }
      }
      t.done.add(n - i - 1);
      if (!swapped) {
        yield t.frame("No swaps in this pass: everything is in order.", 5);
        break;
      }
    }
    yield t.finish();
    return t.a;
  },
});

const selection = define({
  intro:
    "Find the smallest value in the unsorted part and swap it to the front of that part. Each pass fixes one more position from the left. It always does about n²/2 comparisons but at most n − 1 swaps.",
  use: "When writes are expensive (flash memory) and n is small.",
  traits: ["In place", "Not stable"],
  pseudocode: ["for i from 0 to n − 2", "  min ← i", "  for j from i + 1 to n − 1", "    if a[j] < a[min]: min ← j", "  swap a[i], a[min]"],
  input: quadratic,
  presets: presets(),
  *run(input) {
    const t = new Tracker([...input]);
    const n = t.a.length;
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      yield t.frame(`Find the smallest value from position ${i} on.`, 1, { [i]: Tone.ACTIVE }, { pointers: [{ index: i, label: "i" }] });
      for (let j = i + 1; j < n; j++) {
        const smaller = t.less(j, min);
        yield t.frame(
          smaller ? `${t.a[j]} < ${t.a[min]}: new smallest.` : `${t.a[j]} ≥ ${t.a[min]}: keep ${t.a[min]}.`,
          3,
          { [min]: Tone.ACTIVE, [j]: Tone.COMPARE },
          { pointers: [{ index: i, label: "i" }, { index: min, label: "min" }] }
        );
        if (smaller) min = j;
      }
      if (min !== i) {
        const [x, y] = [t.a[i], t.a[min]];
        t.swap(i, min);
        yield t.frame(`Swap ${y} into position ${i} (it trades places with ${x}).`, 4, { [i]: Tone.WARN, [min]: Tone.WARN });
      } else yield t.frame(`${t.a[i]} is already the smallest: no swap.`, 4, { [i]: Tone.ACTIVE });
      t.done.add(i);
    }
    yield t.finish();
    return t.a;
  },
});

const insertion = define({
  intro:
    "Grow a sorted part on the left. Take the next value, shift every bigger sorted value one step right, and drop the value into the gap. On almost-sorted input it barely does anything.",
  use: "Small arrays and nearly sorted data; real libraries switch to it for short runs inside merge and quick sort.",
  traits: ["Stable", "In place", "Adaptive", "Online"],
  pseudocode: ["for i from 1 to n − 1", "  key ← a[i]; j ← i − 1", "  while j ≥ 0 and a[j] > key", "    a[j + 1] ← a[j]; j ← j − 1", "  a[j + 1] ← key"],
  input: quadratic,
  presets: presets(),
  *run(input) {
    const t = new Tracker([...input]);
    const n = t.a.length;
    for (let i = 1; i < n; i++) {
      const key = t.a[i];
      let j = i - 1;
      yield t.frame(`Take ${key} and find its place in the sorted part on the left.`, 1, { ...range_tones(0, i, Tone.MARK), [i]: Tone.ACTIVE });
      for (;;) {
        if (j < 0) break;
        t.comparisons++;
        const move = t.a[j] > key;
        yield t.frame(move ? `${t.a[j]} > ${key}: shift it right.` : `${t.a[j]} ≤ ${key}: the gap is right after it.`, 2, { [j]: Tone.COMPARE, [j + 1]: Tone.ACTIVE });
        if (!move) break;
        t.set(j + 1, t.a[j]);
        t.set(j, key);
        yield t.frame(`Shifted ${t.a[j + 1]} one step right.`, 3, { [j + 1]: Tone.WARN, [j]: Tone.ACTIVE });
        j--;
      }
      yield t.frame(`${key} sits at position ${j + 1}.`, 4, { ...range_tones(0, i + 1, Tone.MARK), [j + 1]: Tone.DONE });
    }
    yield t.finish();
    return t.a;
  },
});

const GAPS = {
  shell: (n: number) => {
    const gaps: number[] = [];
    for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) gaps.push(gap);
    return gaps;
  },
  knuth: (n: number) => {
    const gaps: number[] = [];
    for (let gap = 1; gap < n; gap = gap * 3 + 1) gaps.unshift(gap);
    return gaps.length ? gaps : [1];
  },
  ciura: (n: number) => [701, 301, 132, 57, 23, 10, 4, 1].filter((gap) => gap < n || gap === 1),
};

const shell = define({
  intro:
    "Insertion sort is slow because values move one step at a time. Shell sort first insertion-sorts values that are far apart (a gap), then shrinks the gap until it is 1. By then the array is nearly sorted and the last pass is cheap.",
  use: "Embedded code that wants a fast in-place sort with tiny code size. The gap sequence decides how fast it is.",
  traits: ["In place", "Not stable"],
  pseudocode: [
    "for gap in gaps, largest first",
    "  for i from gap to n − 1",
    "    tmp ← a[i]; j ← i",
    "    while j ≥ gap and a[j − gap] > tmp",
    "      a[j] ← a[j − gap]; j ← j − gap",
    "    a[j] ← tmp",
  ],
  input: quadratic,
  presets: presets(),
  params: [
    {
      id: "gaps",
      label: "Gaps",
      kind: "choice",
      choices: [
        { value: "shell", label: "n/2, n/4, … (Shell)" },
        { value: "knuth", label: "1, 4, 13, … (Knuth)" },
        { value: "ciura", label: "1, 4, 10, 23, … (Ciura)" },
      ],
      default: "knuth",
    },
  ],
  *run(input, params) {
    const t = new Tracker([...input]);
    const n = t.a.length;
    const gaps = GAPS[(params.gaps as keyof typeof GAPS) ?? "knuth"](n);
    for (const gap of gaps) {
      yield t.frame(`Gap ${gap}: insertion-sort every ${gap === 1 ? "value" : `${gap}th value`}.`, 0);
      for (let i = gap; i < n; i++) {
        const tmp = t.a[i];
        let j = i;
        while (j >= gap) {
          t.comparisons++;
          const move = t.a[j - gap] > tmp;
          yield t.frame(move ? `${t.a[j - gap]} > ${tmp}: move it ${gap} right.` : `${t.a[j - gap]} ≤ ${tmp}: stop.`, 3, { [j - gap]: Tone.COMPARE, [j]: Tone.ACTIVE });
          if (!move) break;
          t.set(j, t.a[j - gap]);
          t.set(j - gap, tmp);
          yield t.frame(`Moved ${t.a[j]} from ${j - gap} to ${j}.`, 4, { [j]: Tone.WARN, [j - gap]: Tone.ACTIVE });
          j -= gap;
        }
      }
    }
    yield t.finish();
    return t.a;
  },
});

const merge = define({
  intro:
    "Split the array in half, sort each half the same way, then merge the two sorted halves by repeatedly taking the smaller front value. The work is the same for every input: n log n, at the price of a second array.",
  use: "When you need a guaranteed n log n and a stable sort: linked lists, external sorting of files too big for memory, and most standard library sorts (Timsort is a merge sort).",
  traits: ["Stable", "Not in place", "Divide and conquer"],
  pseudocode: [
    "merge_sort(lo, hi):",
    "  if lo ≥ hi: return",
    "  mid ← ⌊(lo + hi) / 2⌋",
    "  merge_sort(lo, mid); merge_sort(mid + 1, hi)",
    "  copy a[lo..hi] to aux",
    "  take the smaller front of the two halves",
    "  write it to a[k]; k ← k + 1",
  ],
  input: fast,
  presets: presets(),
  *run(input) {
    const t = new Tracker([...input]);
    function* sort(lo: number, hi: number, depth: number): Generator<Step> {
      if (lo >= hi) return;
      const mid = Math.floor((lo + hi) / 2);
      yield t.frame(`Split ${lo}–${hi} at ${mid}${depth ? "" : " (the whole array)"}.`, 2, { ...range_tones(lo, mid + 1, Tone.MARK), ...range_tones(mid + 1, hi + 1, Tone.COMPARE) });
      yield* sort(lo, mid, depth + 1);
      yield* sort(mid + 1, hi, depth + 1);
      const aux = t.a.slice(lo, hi + 1);
      const left = mid - lo;
      let i = 0;
      let j = left + 1;
      const buffer = () => grid({ title: "aux", rows: [cells(aux, { ...range_tones(0, i, Tone.MUTED), ...range_tones(left + 1, j, Tone.MUTED), [i]: Tone.ACTIVE, [j]: Tone.ACTIVE })] });
      yield t.frame(`Merge ${lo}–${mid} with ${mid + 1}–${hi}.`, 4, range_tones(lo, hi + 1, Tone.MARK), { extra: [buffer()] });
      for (let k = lo; k <= hi; k++) {
        let take: number;
        let note: string;
        if (i > left) {
          take = aux[j++];
          note = `Left half used up: take ${take} from the right.`;
        } else if (j > hi - lo) {
          take = aux[i++];
          note = `Right half used up: take ${take} from the left.`;
        } else {
          t.comparisons++;
          if (aux[j] < aux[i]) {
            note = `${aux[j]} < ${aux[i]}: take ${aux[j]} from the right.`;
            take = aux[j++];
          } else {
            note = `${aux[i]} ≤ ${aux[j]}: take ${aux[i]} from the left (ties go left, which keeps it stable).`;
            take = aux[i++];
          }
        }
        t.set(k, take);
        yield t.frame(note, 6, { ...range_tones(k + 1, hi + 1, Tone.MARK), [k]: Tone.WARN }, { pointers: [{ index: k, label: "k" }], extra: [buffer()] });
      }
    }
    yield* sort(0, t.a.length - 1, 0);
    yield t.finish();
    return t.a;
  },
});

const quick = define({
  intro:
    "Pick a pivot and partition: everything smaller goes left of it, everything else right, and the pivot lands in its final place. Then sort both sides the same way. It is usually the fastest in practice, but a bad pivot on every split makes it quadratic.",
  use: "General-purpose in-memory sorting. Pick the pivot well (median of three, random) to avoid the sorted-input worst case.",
  traits: ["In place", "Not stable", "Divide and conquer"],
  pseudocode: [
    "quick_sort(lo, hi):",
    "  if lo ≥ hi: return",
    "  choose a pivot, move it to a[hi]",
    "  i ← lo",
    "  for j from lo to hi − 1",
    "    if a[j] < pivot: swap a[i], a[j]; i ← i + 1",
    "  swap a[i], a[hi]  (the pivot is placed)",
    "  quick_sort(lo, i − 1); quick_sort(i + 1, hi)",
  ],
  input: fast,
  presets: presets(),
  params: [
    {
      id: "pivot",
      label: "Pivot",
      kind: "choice",
      choices: [
        { value: "last", label: "Last value" },
        { value: "middle", label: "Middle value" },
        { value: "median", label: "Median of three" },
        { value: "random", label: "Random" },
      ],
      default: "median",
    },
  ],
  *run(input, params) {
    const t = new Tracker([...input]);
    const choose = (lo: number, hi: number) => {
      const mid = Math.floor((lo + hi) / 2);
      if (params.pivot === "last") return hi;
      if (params.pivot === "middle") return mid;
      if (params.pivot === "random") return lo + Math.floor(Math.random() * (hi - lo + 1));
      const trio = [lo, mid, hi].sort((x, y) => t.a[x] - t.a[y]);
      return trio[1];
    };
    function* sort(lo: number, hi: number): Generator<Step> {
      if (lo > hi) return;
      if (lo === hi) {
        t.done.add(lo);
        return;
      }
      const p = choose(lo, hi);
      yield t.frame(`Sort ${lo}–${hi}. Pivot: ${t.a[p]}.`, 2, { ...range_tones(lo, hi + 1, Tone.MARK), [p]: Tone.ACTIVE });
      if (p !== hi) {
        t.swap(p, hi);
        yield t.frame(`Move the pivot ${t.a[hi]} to the end of the range.`, 2, { [p]: Tone.WARN, [hi]: Tone.ACTIVE });
      }
      const pivot = t.a[hi];
      let i = lo;
      for (let j = lo; j < hi; j++) {
        const smaller = t.less(j, hi);
        yield t.frame(
          smaller ? `${t.a[j]} < ${pivot}: it belongs on the left.` : `${t.a[j]} ≥ ${pivot}: leave it on the right.`,
          5,
          { ...range_tones(lo, i, Tone.MARK), [j]: Tone.COMPARE, [hi]: Tone.ACTIVE },
          { pointers: [{ index: i, label: "i" }, { index: j, label: "j" }] }
        );
        if (smaller) {
          if (i !== j) {
            t.swap(i, j);
            yield t.frame(`Swap ${t.a[i]} into the left part.`, 5, { [i]: Tone.WARN, [j]: Tone.WARN, [hi]: Tone.ACTIVE });
          }
          i++;
        }
      }
      if (i !== hi) t.swap(i, hi);
      t.done.add(i);
      yield t.frame(`The pivot ${pivot} lands at ${i}: smaller values are left of it, the rest right.`, 6, { [i]: Tone.DONE });
      yield* sort(lo, i - 1);
      yield* sort(i + 1, hi);
    }
    yield* sort(0, t.a.length - 1);
    yield t.finish();
    return t.a;
  },
});

export function heap_tree(values: number[], size: number, tones: Tones = {}): TreeNode | null {
  const node = (index: number): TreeNode | null =>
    index < size
      ? { id: `h${index}`, label: String(values[index]), tone: tones[index], children: [node(2 * index + 1), node(2 * index + 2)] }
      : null;
  return node(0);
}

const heap = define({
  intro:
    "Read the array as a binary tree (children of i are 2i + 1 and 2i + 2) and turn it into a max-heap, where every parent is at least its children. The largest value is then at the root: swap it to the end, shrink the heap, and sift the new root down. Repeat.",
  use: "When you need n log n in the worst case with no extra memory, like in kernels and embedded systems. Introsort falls back to it.",
  traits: ["In place", "Not stable"],
  pseudocode: [
    "for i from ⌊n/2⌋ − 1 down to 0: sift_down(i, n)",
    "for end from n − 1 down to 1",
    "  swap a[0], a[end]  (the largest goes to the back)",
    "  sift_down(0, end)",
    "sift_down(i, size):",
    "  largest ← the biggest of i and its children",
    "  if largest ≠ i: swap, continue from largest",
  ],
  input: numbers({ sample: SAMPLE, max_count: 63, min: 0, max: 999, random_count: 15 }),
  presets: presets(15),
  *run(input) {
    const t = new Tracker([...input]);
    const n = t.a.length;
    let size = n;
    const frame = (note: string, line: number, tones: Tones = {}) => {
      const step = t.frame(note, line, tones);
      const root = heap_tree(t.a, size, tones);
      if (root) step.views.push({ kind: "tree", title: "heap", roots: [root] });
      return step;
    };
    function* sift(i: number): Generator<Step> {
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let largest = i;
        if (l < size && t.less(largest, l)) largest = l;
        if (r < size && t.less(largest, r)) largest = r;
        const kids = [l, r].filter((k) => k < size);
        if (kids.length === 0) return;
        yield frame(
          largest === i ? `${t.a[i]} is at least its children: stop here.` : `${t.a[largest]} is the biggest of ${t.a[i]} and its children.`,
          5,
          { [i]: Tone.ACTIVE, ...Object.fromEntries(kids.map((k) => [k, Tone.COMPARE])) }
        );
        if (largest === i) return;
        t.swap(i, largest);
        yield frame(`Swap ${t.a[largest]} down, ${t.a[i]} up.`, 6, { [i]: Tone.WARN, [largest]: Tone.WARN });
        i = largest;
      }
    }
    yield frame("Read the array as a tree and build a max-heap from the bottom up.", 0);
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) yield* sift(i);
    yield frame("Max-heap built: the largest value sits at the root.", 0, { 0: Tone.ACTIVE });
    for (let end = n - 1; end > 0; end--) {
      t.swap(0, end);
      size = end;
      t.done.add(end);
      yield frame(`Move the largest, ${t.a[end]}, to position ${end}.`, 2, { 0: Tone.WARN });
      yield* sift(0);
    }
    t.done.add(0);
    yield t.finish();
    return t.a;
  },
});

const non_negative = numbers({ sample: [4, 1, 3, 4, 2, 0, 3, 1, 2, 4, 0, 3], max_count: 300, min: 0, max: 99, random_count: 20 });

const counting = define({
  intro:
    "Don't compare at all: count how often each value occurs, then write each value back as many times as it was counted. It only works for small whole-number keys, but there it is linear.",
  use: "Small integer keys (grades, ages, bytes), and as the inner step of radix sort.",
  traits: ["Stable (prefix-sum version)", "Not in place", "Non-comparison"],
  pseudocode: ["count ← zeros, size max + 1", "for each x in a: count[x] ← count[x] + 1", "k ← 0", "for v from 0 to max", "  repeat count[v] times: a[k] ← v; k ← k + 1"],
  input: non_negative,
  presets: [
    { label: "Sample", value: [4, 1, 3, 4, 2, 0, 3, 1, 2, 4, 0, 3] },
    { label: "Wide range", value: [90, 3, 45, 3, 77, 12, 90, 0, 61] },
  ],
  *run(input) {
    const t = new Tracker([...input]);
    const max = Math.max(...t.a);
    const count = new Array(max + 1).fill(0);
    const counts = (tones: Tones = {}) => grid({ title: "count", col_labels: count.map((_, v) => String(v)), rows: [cells(count, tones)] });
    yield t.frame(`Make ${max + 1} counters, one per value from 0 to ${max}.`, 0, {}, { extra: [counts()] });
    for (let i = 0; i < t.a.length; i++) {
      count[t.a[i]]++;
      yield t.frame(`Count ${t.a[i]}: it has been seen ${count[t.a[i]]} ${count[t.a[i]] === 1 ? "time" : "times"}.`, 1, { [i]: Tone.ACTIVE }, { extra: [counts({ [t.a[i]]: Tone.WARN })] });
    }
    let k = 0;
    for (let v = 0; v <= max; v++) {
      for (let c = 0; c < count[v]; c++) {
        t.set(k, v);
        t.done.add(k);
        yield t.frame(`Write ${v} at position ${k}.`, 4, { [k]: Tone.WARN }, { extra: [counts({ [v]: Tone.ACTIVE })] });
        k++;
      }
    }
    yield t.finish();
    return t.a;
  },
});

const radix = define({
  intro:
    "Sort by the last digit, then by the second-to-last, and so on. Each pass is a stable bucket pass, so the order from earlier digits survives inside each bucket. After the most significant digit the array is sorted.",
  use: "Fixed-width keys: integers, dates, fixed-length strings. Linear when the number of digits is small.",
  traits: ["Stable", "Not in place", "Non-comparison"],
  pseudocode: ["for each digit, least significant first", "  for each x in a: append x to bucket[digit of x]", "  a ← bucket 0, bucket 1, … read in order"],
  input: numbers({ sample: [170, 45, 75, 90, 802, 24, 2, 66], max_count: 200, min: 0, max: 999, random_count: 14 }),
  params: [
    {
      id: "base",
      label: "Base",
      kind: "choice",
      choices: [
        { value: "10", label: "10 (decimal digits)" },
        { value: "4", label: "4" },
        { value: "2", label: "2 (bits)" },
      ],
      default: "10",
    },
  ],
  *run(input, params) {
    const t = new Tracker([...input]);
    const base = Number(params.base ?? 10);
    const max = Math.max(...t.a);
    let pass = 0;
    for (let place = 1; Math.floor(max / place) > 0 || place === 1; place *= base, pass++) {
      const buckets: number[][] = Array.from({ length: base }, () => []);
      const shelf = (active?: number) =>
        grid({ title: "buckets", row_labels: buckets.map((_, d) => String(d)), rows: buckets.map((bucket, d) => (bucket.length ? cells(bucket, d === active ? { [bucket.length - 1]: Tone.WARN } : {}) : [{ text: "·", tone: Tone.MUTED }])) });
      yield t.frame(`Pass ${pass + 1}: sort by the digit worth ${place} (base ${base}).`, 0, {}, { extra: [shelf()] });
      for (let i = 0; i < t.a.length; i++) {
        const digit = Math.floor(t.a[i] / place) % base;
        buckets[digit].push(t.a[i]);
        yield t.frame(`${t.a[i]} has digit ${digit} here: bucket ${digit}.`, 1, { [i]: Tone.ACTIVE }, { extra: [shelf(digit)] });
      }
      let k = 0;
      for (const bucket of buckets) for (const value of bucket) t.set(k++, value);
      yield t.frame("Read the buckets back in order.", 2, range_tones(0, t.a.length, Tone.WARN), { extra: [shelf()] });
      if (Math.floor(max / (place * base)) === 0) break;
    }
    yield t.finish();
    return t.a;
  },
});

const bucket = define({
  intro:
    "Split the value range into k equal buckets and drop each value into its bucket. Sort each small bucket (here with insertion sort) and concatenate. Fast when values are spread evenly; slow when they all land in one bucket.",
  use: "Evenly distributed data, like floats in [0, 1) or uniformly random keys.",
  traits: ["Stable (with a stable inner sort)", "Not in place"],
  pseudocode: ["make k empty buckets", "for each x: append x to bucket ⌊k · x / (max + 1)⌋", "sort each bucket", "a ← bucket 0, bucket 1, …"],
  input: numbers({ sample: [29, 25, 3, 49, 9, 37, 21, 43, 12, 33], max_count: 200, min: 0, max: 999, random_count: 14 }),
  params: [{ id: "buckets", label: "Buckets", kind: "number", min: 2, max: 10, default: 5 }],
  *run(input, params) {
    const t = new Tracker([...input]);
    const k = Number(params.buckets ?? 5);
    const max = Math.max(...t.a);
    const buckets: number[][] = Array.from({ length: k }, () => []);
    const width = (max + 1) / k;
    const shelf = (active?: number, tones: Tones = {}) =>
      grid({
        title: "buckets",
        row_labels: buckets.map((_, b) => `${Math.ceil(b * width)}–${Math.ceil((b + 1) * width) - 1}`),
        rows: buckets.map((items, b) => (items.length ? cells(items, b === active ? tones : {}) : [{ text: "·", tone: Tone.MUTED }])),
      });
    yield t.frame(`${k} buckets, each covering about ${Math.round(width)} values.`, 0, {}, { extra: [shelf()] });
    for (let i = 0; i < t.a.length; i++) {
      const b = Math.min(k - 1, Math.floor((k * t.a[i]) / (max + 1)));
      buckets[b].push(t.a[i]);
      yield t.frame(`${t.a[i]} goes to bucket ${b}.`, 1, { [i]: Tone.ACTIVE }, { extra: [shelf(b, { [buckets[b].length - 1]: Tone.WARN })] });
    }
    for (let b = 0; b < k; b++) {
      const items = buckets[b];
      for (let i = 1; i < items.length; i++) {
        const key = items[i];
        let j = i - 1;
        while (j >= 0) {
          t.comparisons++;
          if (items[j] <= key) break;
          items[j + 1] = items[j];
          j--;
        }
        items[j + 1] = key;
      }
      if (items.length) yield t.frame(`Sort bucket ${b}: ${items.join(", ")}.`, 2, {}, { extra: [shelf(b, range_tones(0, items.length, Tone.DONE))] });
    }
    let k2 = 0;
    for (const items of buckets) for (const value of items) t.set(k2++, value);
    yield t.frame("Concatenate the buckets.", 3, range_tones(0, t.a.length, Tone.WARN), { extra: [shelf()] });
    yield t.finish();
    return t.a;
  },
});

const RACERS = {
  "bubble-sort": bubble,
  "selection-sort": selection,
  "insertion-sort": insertion,
  "shell-sort": shell,
  "merge-sort": merge,
  "quick-sort": quick,
  "heap-sort": heap,
} as const;
type Racer = keyof typeof RACERS;

const RACER_CHOICES = [
  { value: "bubble-sort", label: "Bubble sort" },
  { value: "selection-sort", label: "Selection sort" },
  { value: "insertion-sort", label: "Insertion sort" },
  { value: "shell-sort", label: "Shell sort" },
  { value: "merge-sort", label: "Merge sort" },
  { value: "quick-sort", label: "Quick sort" },
  { value: "heap-sort", label: "Heap sort" },
];

const race = define({
  intro:
    "Run two sorts on the same input in lockstep: one step of each per frame. The step counts and comparison totals make the gap between n² and n log n visible, and the presets show where each one shines or collapses.",
  use: "Comparing algorithms on the same data, like insertion sort against quick sort on nearly sorted input.",
  pseudocode: ["copy the input for both sorts", "repeat: run one step of each sort that isn't finished", "the first to finish wins"],
  input: numbers({ sample: [...SAMPLE, 5, 61, 33, 18, 74, 40, 2, 90], max_count: 120, min: 0, max: 999, random_count: 40 }),
  presets: presets(40),
  params: [
    { id: "left", label: "Left", kind: "choice", choices: RACER_CHOICES, default: "bubble-sort" },
    { id: "right", label: "Right", kind: "choice", choices: RACER_CHOICES, default: "quick-sort" },
  ],
  *run(input, params) {
    const names = { left: String(params.left), right: String(params.right) } as Record<"left" | "right", Racer>;
    const label = (side: "left" | "right") => RACER_CHOICES.find((choice) => choice.value === names[side])?.label ?? names[side];
    const runs = (["left", "right"] as const).map((side) => {
      const definition = RACERS[names[side]] ?? quick;
      return { side, recording: record(definition as Definition<number[], number[]>, input, { pivot: "median", gaps: "knuth" }) };
    });
    const longest = Math.max(...runs.map((run) => run.recording.steps.length));
    const winner = runs[0].recording.steps.length <= runs[1].recording.steps.length ? runs[0] : runs[1];
    for (let i = 0; i < longest; i++) {
      const views: View[] = [];
      const counters: Record<string, number | string> = {};
      const notes: string[] = [];
      for (const run of runs) {
        const steps = run.recording.steps;
        const step = steps[Math.min(i, steps.length - 1)];
        const bars = step.views.find((view) => view.kind === "bars");
        if (bars) views.push({ ...bars, title: `${label(run.side)}${i >= steps.length - 1 ? " · done" : ""}` });
        counters[`${label(run.side)} steps`] = Math.min(i + 1, steps.length);
        counters[`${label(run.side)} comparisons`] = step.counters?.comparisons ?? 0;
        if (i < steps.length) notes.push(`${label(run.side)}: ${step.note}`);
      }
      yield { views, line: 1, note: notes.join("  ·  "), counters };
    }
    const loser = winner === runs[0] ? runs[1] : runs[0];
    const tie = winner.recording.steps.length === loser.recording.steps.length;
    const last = runs.map((run) => run.recording.steps.at(-1)!.views.find((view) => view.kind === "bars")!).map((bars, i) => ({ ...bars, title: label(runs[i].side) })) as View[];
    yield {
      views: last,
      line: 2,
      note: tie ? "A tie: same number of steps." : `${label(winner.side)} wins: ${winner.recording.steps.length} steps against ${loser.recording.steps.length}.`,
    };
    return { winner: tie ? null : names[winner.side] };
  },
});

export default {
  "bubble-sort": bubble,
  "selection-sort": selection,
  "insertion-sort": insertion,
  "shell-sort": shell,
  "merge-sort": merge,
  "quick-sort": quick,
  "heap-sort": heap,
  "counting-sort": counting,
  "radix-sort": radix,
  "bucket-sort": bucket,
  "sort-race": race,
} as unknown as Record<string, Definition>;
