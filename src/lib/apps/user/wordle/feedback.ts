export const Mark = { ABSENT: "absent", PRESENT: "present", CORRECT: "correct" } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export interface Row {
  guess: string;
  marks: readonly Mark[];
}

const RANK: Record<Mark, number> = { absent: 0, present: 1, correct: 2 };

// Greens first, then yellows from the answer's letters left over, so a doubled guess letter is yellow only as often as the answer has it.
export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from({ length: guess.length }, () => Mark.ABSENT);
  const left = new Map<string, number>();
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) marks[i] = Mark.CORRECT;
    else left.set(answer[i], (left.get(answer[i]) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === Mark.CORRECT) continue;
    const count = left.get(guess[i]) ?? 0;
    if (count > 0) {
      marks[i] = Mark.PRESENT;
      left.set(guess[i], count - 1);
    }
  }
  return marks;
}

export function solved(marks: readonly Mark[]): boolean {
  return marks.every((mark) => mark === Mark.CORRECT);
}

export function key_marks(rows: readonly Row[]): Map<string, Mark> {
  const keys = new Map<string, Mark>();
  for (const row of rows) {
    for (let i = 0; i < row.guess.length; i++) {
      const current = keys.get(row.guess[i]);
      if (current === undefined || RANK[row.marks[i]] > RANK[current]) keys.set(row.guess[i], row.marks[i]);
    }
  }
  return keys;
}

const ORDINALS = ["1st", "2nd", "3rd"];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

export function hard_mode_error(guess: string, rows: readonly Row[]): string | null {
  for (const row of rows) {
    for (let i = 0; i < row.guess.length; i++) {
      if (row.marks[i] === Mark.CORRECT && guess[i] !== row.guess[i])
        return `${ordinal(i + 1)} letter must be ${row.guess[i].toUpperCase()}`;
    }
    const needed = new Map<string, number>();
    for (let i = 0; i < row.guess.length; i++) {
      if (row.marks[i] !== Mark.ABSENT) needed.set(row.guess[i], (needed.get(row.guess[i]) ?? 0) + 1);
    }
    for (const [letter, count] of needed) {
      if (count_of(guess, letter) < count)
        return `Guess must contain ${letter.toUpperCase()}${count > 1 ? ` ${count} times` : ""}`;
    }
  }
  return null;
}

function count_of(text: string, letter: string): number {
  let count = 0;
  for (const char of text) if (char === letter) count++;
  return count;
}

export interface AbsurdleStep {
  marks: Mark[];
  candidates: string[];
}

// Ties go to the pattern that reveals least, then to pattern order, so replaying a save lands on the same words.
export function absurdle_step(candidates: readonly string[], guess: string): AbsurdleStep {
  const buckets = new Map<string, { marks: Mark[]; words: string[] }>();
  for (const word of candidates) {
    const marks = score(guess, word);
    const key = marks.map((mark) => RANK[mark]).join("");
    const bucket = buckets.get(key);
    if (bucket) bucket.words.push(word);
    else buckets.set(key, { marks, words: [word] });
  }
  let best: { key: string; marks: Mark[]; words: string[] } | null = null;
  for (const [key, bucket] of buckets) {
    if (!best || compare(bucket.words.length, bucket.marks, key, best.words.length, best.marks, best.key) < 0)
      best = { key, ...bucket };
  }
  if (!best) return { marks: Array.from({ length: guess.length }, () => Mark.ABSENT), candidates: [] };
  return { marks: best.marks, candidates: best.words };
}

function compare(
  size_a: number,
  marks_a: Mark[],
  key_a: string,
  size_b: number,
  marks_b: Mark[],
  key_b: string
): number {
  if (size_a !== size_b) return size_b - size_a;
  const greens = (marks: Mark[]) => marks.filter((mark) => mark === Mark.CORRECT).length;
  const yellows = (marks: Mark[]) => marks.filter((mark) => mark === Mark.PRESENT).length;
  if (greens(marks_a) !== greens(marks_b)) return greens(marks_a) - greens(marks_b);
  if (yellows(marks_a) !== yellows(marks_b)) return yellows(marks_a) - yellows(marks_b);
  return key_a < key_b ? -1 : key_a > key_b ? 1 : 0;
}
