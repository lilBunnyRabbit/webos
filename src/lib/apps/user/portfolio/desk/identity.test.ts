import { describe, expect, test } from "vitest";
import { PROFILE } from "../content/profile";
import { JOBS } from "../content/experience";
import { experience_line, first_clause, keep_hyphenated, lead_clause } from "./identity";
import { ink_for } from "./ink";

describe("first_clause", () => {
  test("a highlight shows its opening clause whole, never an ellipsis", () => {
    const [first, second] = JOBS[0].highlights!.items;
    expect(first_clause(first)).toBe("Co-developed the flagship Exam Prep product through four major iterations");
    expect(first_clause(second)).toBe("Improved AI tutor chat reliability");
    expect(JOBS[0].highlights!.items.every((item) => !first_clause(item).endsWith("…"))).toBe(true);
  });

  test("a sentence with no early break stays whole, without its full stop", () => {
    expect(first_clause("Short, and sweet.")).toBe("Short, and sweet");
  });
});

describe("ink_for", () => {
  test("the primary button keeps its usual text unless that fails on a pale primary", () => {
    expect(ink_for([128, 160, 90], [30, 40, 45], [190, 185, 180])).toBe("text-background");
    expect(ink_for([80, 175, 180], [246, 249, 252], [40, 36, 30])).toBe("text-foreground");
  });
});

describe("experience_line", () => {
  test("takes the years from the approved short bio", () => {
    expect(experience_line(PROFILE.about_short.text)).toBe("Nearly seven years of experience");
  });

  test("says nothing when the bio names no years", () => {
    expect(experience_line("I build things.")).toBeNull();
  });
});

describe("keep_hyphenated", () => {
  test("marks hyphenated words to keep whole, and keeps every character", () => {
    const parts = keep_hyphenated(PROFILE.role);
    expect(parts.map((part) => part.text).join("")).toBe(PROFILE.role);
    expect(parts.filter((part) => part.keep).map((part) => part.text)).toEqual(["Full-Stack"]);
  });
});

describe("lead_clause", () => {
  test("short text stays whole", () => {
    expect(lead_clause("Improved chat.", 40)).toBe("Improved chat.");
  });

  test("a long sentence ends at a clause boundary, never mid-word", () => {
    const text = "Co-developed the flagship Exam Prep product through four major iterations, delivering features across frontend and backend.";
    expect(lead_clause(text, 100)).toBe("Co-developed the flagship Exam Prep product through four major iterations…");
  });

  test("without a clause boundary it ends on a whole word", () => {
    expect(lead_clause("one two three four five six", 12)).toBe("one two…");
  });
});
