import { describe, expect, it } from "vitest";
import { absurdle_step, hard_mode_error, key_marks, Mark, score, type Row } from "./feedback";

const code = (marks: readonly Mark[]) =>
  marks.map((mark) => (mark === Mark.CORRECT ? "G" : mark === Mark.PRESENT ? "Y" : ".")).join("");
const row = (guess: string, answer: string): Row => ({ guess, marks: score(guess, answer) });

describe("score", () => {
  it("marks greens, yellows and greys", () => {
    expect(code(score("crane", "crane"))).toBe("GGGGG");
    expect(code(score("react", "crane"))).toBe("YYGY.");
    expect(code(score("slump", "crane"))).toBe(".....");
  });

  it("only yellows a doubled letter as often as the answer has it", () => {
    expect(code(score("speed", "abide"))).toBe("..Y.Y");
    expect(code(score("eerie", "abide"))).toBe("...YG");
    expect(code(score("llama", "hello"))).toBe("YY...");
  });

  it("gives greens first, then yellows from the letters left", () => {
    expect(code(score("lolly", "hello"))).toBe(".YGG.");
    expect(code(score("allee", "eagle"))).toBe("YY.YG");
  });
});

describe("key_marks", () => {
  it("keeps the best mark a key has earned", () => {
    const keys = key_marks([row("react", "crane"), row("crane", "crane")]);
    expect(keys.get("r")).toBe(Mark.CORRECT);
    expect(keys.get("t")).toBe(Mark.ABSENT);
  });
});

describe("hard_mode_error", () => {
  const rows = [row("crate", "crane")];

  it("accepts a guess that keeps greens and uses yellows", () => {
    expect(hard_mode_error("crave", rows)).toBeNull();
    expect(hard_mode_error("crank", rows)).toBe("5th letter must be E");
  });

  it("rejects a moved green", () => {
    expect(hard_mode_error("track", rows)).toBe("1st letter must be C");
  });

  it("rejects a guess that drops a yellow", () => {
    const yellow = [row("earth", "crane")];
    expect(hard_mode_error("bloke", yellow)).toBe("Guess must contain A");
  });

  it("counts a letter revealed twice", () => {
    const twice = [row("eerie", "geese")];
    expect(code(twice[0].marks)).toBe("YG..G");
    expect(hard_mode_error("hedge", twice)).toBe("Guess must contain E 3 times");
    expect(hard_mode_error("eerie", twice)).toBeNull();
  });
});

describe("absurdle_step", () => {
  const words = ["about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult", "after", "again"];

  it("keeps the largest group of words that would show the same pattern", () => {
    const step = absurdle_step(words, "zzzzz");
    expect(step.candidates).toEqual(words);
    expect(code(step.marks)).toBe(".....");
  });

  it("splits by pattern and keeps the biggest bucket", () => {
    const step = absurdle_step(words, "abuse");
    const groups = new Map<string, string[]>();
    for (const word of words) {
      const key = code(score("abuse", word));
      groups.set(key, [...(groups.get(key) ?? []), word]);
    }
    const biggest = Math.max(...[...groups.values()].map((group) => group.length));
    expect(step.candidates.length).toBe(biggest);
    expect(step.candidates.every((word) => code(score("abuse", word)) === code(step.marks))).toBe(true);
  });

  it("breaks ties toward the pattern that reveals least", () => {
    const step = absurdle_step(["crane", "slump"], "crane");
    expect(step.candidates).toEqual(["slump"]);
    expect(code(step.marks)).toBe(".....");
  });

  it("only lets the guess win once one word is left", () => {
    const step = absurdle_step(["crane"], "crane");
    expect(code(step.marks)).toBe("GGGGG");
  });
});
