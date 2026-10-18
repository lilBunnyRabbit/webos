import { z } from "zod";
import { define, type Definition } from "../../engine/definition";
import { InputError, InputKind, random_int, type InputSpec } from "../../engine/inputs";
import { range_tones, Tone, type Pointer, type Step, type Tones } from "../../engine/step";

export interface Query {
  values: number[];
  target: number;
}

function query_spec(options: { sample: Query; sorted: boolean; hint: string; name: string; max?: number }): InputSpec<Query> {
  const max = options.max ?? 40;
  const check = (value: Query) => {
    if (value.values.length === 0) throw new InputError("Give at least one number before the |.");
    if (value.values.length > max) throw new InputError(`At most ${max} numbers.`);
    if (value.values.some((n) => !Number.isInteger(n) || Math.abs(n) > 999) || !Number.isInteger(value.target) || Math.abs(value.target) > 9999) throw new InputError("Whole numbers only, up to 999.");
    if (options.sorted && value.values.some((n, i) => i > 0 && n < value.values[i - 1])) throw new InputError("This search needs the numbers in ascending order.");
    return value;
  };
  return {
    kind: InputKind.TEXT,
    hint: options.hint,
    schema: z.object({ values: z.array(z.number().int()), target: z.number().int() }).transform((value, context) => {
      try {
        return check(value);
      } catch (error) {
        context.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    }) as unknown as z.ZodType<Query>,
    parse: (text) => {
      const at = text.indexOf("|");
      if (at === -1) throw new InputError(`Separate the numbers and the ${options.name} with |.`);
      const values = text
        .slice(0, at)
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      return check({ values, target: Number(text.slice(at + 1).trim()) });
    },
    format: (value) => `${value.values.join(", ")} | ${value.target}`,
    random: () => {
      const values = Array.from({ length: 14 }, () => random_int(1, 99));
      if (options.sorted) values.sort((a, b) => a - b);
      return { values, target: options.name === "window size" ? random_int(2, 4) : Math.random() < 0.7 ? values[random_int(0, values.length - 1)] + (options.name === "sum" ? values[random_int(0, values.length - 1)] : 0) : random_int(1, 99) };
    },
    sample: options.sample,
  };
}

const SORTED: Query = { values: [3, 8, 15, 21, 30, 42, 55, 61, 70, 84, 91, 97], target: 61 };

function frame_for(values: number[], counters: () => Record<string, number | string>) {
  return (note: string, line: number, tones: Tones = {}, pointers: Pointer[] = []): Step => ({
    views: [{ kind: "bars", values, tones, pointers }],
    line,
    note,
    counters: counters(),
  });
}

const linear = define({
  intro: "Look at every element in turn until you find the target or run out. It needs no order and no setup, so it's the right answer for small or unsorted data, but it takes O(n) on average.",
  use: "Small arrays, unsorted data, or a single lookup where sorting first would cost more.",
  traits: ["No order needed", "O(n)"],
  pseudocode: ["for i from 0 to n − 1:", "  if a[i] = target: return i", "return not found"],
  input: query_spec({ sample: { values: [42, 8, 61, 15, 3, 97, 30, 21], target: 30 }, sorted: false, hint: "Numbers | target, like 42, 8, 61 | 61", name: "target" }),
  *run({ values, target }: Query) {
    let comparisons = 0;
    const frame = frame_for(values, () => ({ comparisons }));
    for (let i = 0; i < values.length; i++) {
      comparisons++;
      if (values[i] === target) {
        yield frame(`a[${i}] = ${target}: found it.`, 1, { ...range_tones(0, i, Tone.MUTED), [i]: Tone.DONE }, [{ index: i, label: "i" }]);
        return { index: i, comparisons };
      }
      yield frame(`a[${i}] = ${values[i]}, not ${target}.`, 1, { ...range_tones(0, i, Tone.MUTED), [i]: Tone.COMPARE }, [{ index: i, label: "i" }]);
    }
    yield frame(`${target} isn't in the array.`, 2, range_tones(0, values.length, Tone.MUTED));
    return { index: -1, comparisons };
  },
});

const binary = define({
  intro:
    "On a sorted array, compare the target with the middle element. If it's smaller, the target can only be in the left half; if bigger, the right half. Each step throws away half of what's left, so a million elements take about 20 comparisons.",
  use: "Any lookup in sorted data, and 'find the first value where a condition becomes true' problems (git bisect, answer search).",
  traits: ["Sorted input", "O(log n)", "Divide and conquer"],
  pseudocode: ["lo ← 0; hi ← n − 1", "while lo ≤ hi:", "  mid ← ⌊(lo + hi) / 2⌋", "  a[mid] = target: return mid", "  a[mid] < target: lo ← mid + 1", "  else: hi ← mid − 1", "return not found"],
  input: query_spec({ sample: SORTED, sorted: true, hint: "Sorted numbers | target, like 3, 8, 15, 21 | 15", name: "target" }),
  *run({ values, target }: Query) {
    let comparisons = 0;
    let lo = 0;
    let hi = values.length - 1;
    const frame = frame_for(values, () => ({ comparisons, "range left": Math.max(0, hi - lo + 1) }));
    const outside = () => ({ ...range_tones(0, lo, Tone.MUTED), ...range_tones(hi + 1, values.length, Tone.MUTED) });
    yield frame(`Search ${target} in all ${values.length} elements.`, 0, {}, [{ index: lo, label: "lo" }, { index: hi, label: "hi" }]);
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      comparisons++;
      const pointers = [{ index: lo, label: "lo" }, { index: mid, label: "mid", tone: Tone.ACTIVE }, { index: hi, label: "hi" }];
      if (values[mid] === target) {
        yield frame(`a[${mid}] = ${target}: found it after ${comparisons} ${comparisons === 1 ? "comparison" : "comparisons"}.`, 3, { ...outside(), [mid]: Tone.DONE }, pointers);
        return { index: mid, comparisons };
      }
      const right = values[mid] < target;
      yield frame(`a[${mid}] = ${values[mid]} ${right ? "<" : ">"} ${target}: the target must be on the ${right ? "right" : "left"}.`, right ? 4 : 5, { ...outside(), [mid]: Tone.COMPARE }, pointers);
      if (right) lo = mid + 1;
      else hi = mid - 1;
    }
    yield frame(`The range is empty: ${target} isn't there.`, 6, range_tones(0, values.length, Tone.MUTED));
    return { index: -1, comparisons };
  },
});

const interpolation = define({
  intro:
    "Like binary search, but instead of always probing the middle it guesses where the target should be from its value, the way you open a phone book near the back for 'W'. On evenly spread data that takes O(log log n) probes; on skewed data it can degrade to O(n).",
  use: "Large sorted arrays with roughly uniform values, like IDs or timestamps.",
  traits: ["Sorted input", "O(log log n) on uniform data"],
  pseudocode: [
    "lo ← 0; hi ← n − 1",
    "while lo ≤ hi and a[lo] ≤ target ≤ a[hi]:",
    "  pos ← lo + (target − a[lo]) · (hi − lo) / (a[hi] − a[lo])",
    "  a[pos] = target: return pos",
    "  a[pos] < target: lo ← pos + 1, else hi ← pos − 1",
    "return not found",
  ],
  input: query_spec({ sample: SORTED, sorted: true, hint: "Sorted numbers | target, like 10, 20, 30, 40 | 30", name: "target" }),
  presets: [
    { label: "Evenly spread", value: { values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120], target: 90 } },
    { label: "Skewed", value: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 999], target: 11 } },
  ],
  *run({ values, target }: Query) {
    let probes = 0;
    let lo = 0;
    let hi = values.length - 1;
    const frame = frame_for(values, () => ({ probes }));
    const outside = () => ({ ...range_tones(0, lo, Tone.MUTED), ...range_tones(hi + 1, values.length, Tone.MUTED) });
    while (lo <= hi && target >= values[lo] && target <= values[hi]) {
      const pos = values[hi] === values[lo] ? lo : lo + Math.floor(((target - values[lo]) * (hi - lo)) / (values[hi] - values[lo]));
      probes++;
      const pointers = [{ index: lo, label: "lo" }, { index: pos, label: "pos", tone: Tone.ACTIVE }, { index: hi, label: "hi" }];
      if (values[pos] === target) {
        yield frame(`${target} sits ${Math.round(((target - values[lo]) / Math.max(1, values[hi] - values[lo])) * 100)}% of the way from ${values[lo]} to ${values[hi]}: probe ${pos}, and there it is.`, 3, { ...outside(), [pos]: Tone.DONE }, pointers);
        return { index: pos, probes };
      }
      yield frame(`Estimate position ${pos} from the values; a[${pos}] = ${values[pos]} ${values[pos] < target ? "<" : ">"} ${target}.`, 4, { ...outside(), [pos]: Tone.COMPARE }, pointers);
      if (values[pos] < target) lo = pos + 1;
      else hi = pos - 1;
    }
    yield frame(`${target} isn't there.`, 5, range_tones(0, values.length, Tone.MUTED));
    return { index: -1, probes };
  },
});

const exponential = define({
  intro:
    "Find a range first, then binary-search inside it. Check positions 1, 2, 4, 8, … until the value there passes the target; the target must lie between the last two checks. That takes O(log i) where i is where the target is, so it's great when the answer is near the start or the array is unbounded.",
  use: "Unbounded or very long sorted streams, and lookups that usually hit near the front.",
  traits: ["Sorted input", "O(log i)"],
  pseudocode: ["if a[0] = target: return 0", "bound ← 1", "while bound < n and a[bound] < target: bound ← bound · 2", "binary search between bound / 2 and min(bound, n − 1)"],
  input: query_spec({ sample: { ...SORTED, target: 21 }, sorted: true, hint: "Sorted numbers | target, like 3, 8, 15, 21 | 15", name: "target" }),
  *run({ values, target }: Query) {
    let comparisons = 1;
    const frame = frame_for(values, () => ({ comparisons }));
    if (values[0] === target) {
      yield frame(`a[0] is already ${target}.`, 0, { 0: Tone.DONE });
      return { index: 0, comparisons };
    }
    let bound = 1;
    while (bound < values.length && values[bound] < target) {
      comparisons++;
      yield frame(`a[${bound}] = ${values[bound]} < ${target}: double the bound.`, 2, { [bound]: Tone.COMPARE }, [{ index: bound, label: "bound" }]);
      bound *= 2;
    }
    let lo = bound >> 1;
    let hi = Math.min(bound, values.length - 1);
    yield frame(`The target must be between ${lo} and ${hi}: binary search there.`, 3, { ...range_tones(0, lo, Tone.MUTED), ...range_tones(hi + 1, values.length, Tone.MUTED), ...range_tones(lo, hi + 1, Tone.MARK) }, [{ index: lo, label: "lo" }, { index: hi, label: "hi" }]);
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      comparisons++;
      if (values[mid] === target) {
        yield frame(`a[${mid}] = ${target}: found it.`, 3, { [mid]: Tone.DONE }, [{ index: mid, label: "mid" }]);
        return { index: mid, comparisons };
      }
      yield frame(`a[${mid}] = ${values[mid]} ${values[mid] < target ? "<" : ">"} ${target}.`, 3, { ...range_tones(lo, hi + 1, Tone.MARK), [mid]: Tone.COMPARE }, [{ index: mid, label: "mid" }]);
      if (values[mid] < target) lo = mid + 1;
      else hi = mid - 1;
    }
    yield frame(`${target} isn't there.`, 3);
    return { index: -1, comparisons };
  },
});

const two_pointers = define({
  intro:
    "To find two numbers in a sorted array that add up to a target, start one pointer at each end. If the sum is too small, move the left pointer right (the only way to grow it); if too big, move the right pointer left. Each step rules out a whole row of pairs, so it's O(n) instead of checking all O(n²) pairs.",
  use: "Pair sums, merging sorted lists, removing duplicates in place, palindromes, container-with-most-water style problems.",
  traits: ["Sorted input", "O(n)"],
  pseudocode: ["l ← 0; r ← n − 1", "while l < r:", "  s ← a[l] + a[r]", "  s = target: found the pair", "  s < target: l ← l + 1", "  s > target: r ← r − 1", "no pair adds up to the target"],
  input: query_spec({ sample: { values: [2, 7, 11, 15, 18, 24, 31, 40], target: 42 }, sorted: true, hint: "Sorted numbers | sum, like 2, 7, 11, 15 | 18", name: "sum" }),
  *run({ values, target }: Query) {
    let steps = 0;
    let l = 0;
    let r = values.length - 1;
    const frame = frame_for(values, () => ({ steps }));
    while (l < r) {
      steps++;
      const sum = values[l] + values[r];
      const pointers = [{ index: l, label: "l" }, { index: r, label: "r" }];
      const outside = { ...range_tones(0, l, Tone.MUTED), ...range_tones(r + 1, values.length, Tone.MUTED) };
      if (sum === target) {
        yield frame(`${values[l]} + ${values[r]} = ${target}: found the pair.`, 3, { ...outside, [l]: Tone.DONE, [r]: Tone.DONE }, pointers);
        return { pair: [l, r] };
      }
      yield frame(sum < target ? `${values[l]} + ${values[r]} = ${sum} < ${target}: move l right.` : `${values[l]} + ${values[r]} = ${sum} > ${target}: move r left.`, sum < target ? 4 : 5, { ...outside, [l]: Tone.COMPARE, [r]: Tone.COMPARE }, pointers);
      if (sum < target) l++;
      else r--;
    }
    yield frame(`The pointers met: no two numbers add up to ${target}.`, 6, range_tones(0, values.length, Tone.MUTED));
    return { pair: null };
  },
});

const sliding_window = define({
  intro:
    "To find the largest sum of k neighbouring elements, don't add each window from scratch. Slide it: add the element that enters on the right and subtract the one that leaves on the left. Every window then costs O(1), so all of them together cost O(n).",
  use: "Moving averages, rate limiting over the last N seconds, longest substring problems, streaming statistics.",
  traits: ["O(n)", "Reuses the previous window"],
  pseudocode: ["sum ← a[0] + … + a[k − 1]; best ← sum", "for i from k to n − 1:", "  sum ← sum + a[i] − a[i − k]", "  best ← max(best, sum)"],
  input: query_spec({ sample: { values: [4, 2, 12, 3, 8, 9, 1, 7, 5, 11, 2, 6], target: 3 }, sorted: false, hint: "Numbers | window size, like 4, 2, 12, 3, 8 | 3", name: "window size" }),
  *run({ values, target: k }: Query) {
    if (k < 1 || k > values.length) {
      yield frame_for(values, () => ({}))(`A window of ${k} doesn't fit in ${values.length} numbers.`, -1);
      return { best: null, at: -1 };
    }
    let additions = 0;
    let sum = values.slice(0, k).reduce((total, value) => total + value, 0);
    additions += k;
    let best = sum;
    let best_at = 0;
    const frame = frame_for(values, () => ({ additions, sum, best }));
    yield frame(`The first window, 0–${k - 1}, sums to ${sum}.`, 0, range_tones(0, k, Tone.MARK), [{ index: 0, label: "start" }]);
    for (let i = k; i < values.length; i++) {
      sum += values[i] - values[i - k];
      additions += 2;
      const better = sum > best;
      if (better) {
        best = sum;
        best_at = i - k + 1;
      }
      yield frame(`Slide: + ${values[i]} in, − ${values[i - k]} out. Sum ${sum}${better ? ", a new best" : ""}.`, better ? 3 : 2, { ...range_tones(i - k + 1, i + 1, better ? Tone.DONE : Tone.MARK), [i]: Tone.WARN, [i - k]: Tone.BAD }, [{ index: i - k + 1, label: "start" }]);
    }
    yield frame(`The best window starts at ${best_at}: sum ${best}.`, -1, range_tones(best_at, best_at + k, Tone.DONE));
    return { best, at: best_at };
  },
});

export default {
  "linear-search": linear,
  "binary-search": binary,
  "interpolation-search": interpolation,
  "exponential-search": exponential,
  "two-pointers": two_pointers,
  "sliding-window": sliding_window,
} as unknown as Record<string, Definition>;
