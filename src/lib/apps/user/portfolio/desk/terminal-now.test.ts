import { describe, expect, test } from "vitest";
import { Did, now_of, outcome_of, Phase, title_of } from "./terminal-now";
import { TOUR } from "./script";

const playing = { tour: "playing" as const, step: 0, typed: "", beat: null, lit: null, cycling: false };

describe("title_of", () => {
  test("every tour step names the window it opens", () => {
    expect(TOUR.map(({ line }) => title_of(line))).toEqual(["Who I am", "Work", "Projects", "How I build", "Contact"]);
  });
});

describe("now_of", () => {
  test("typing names the step being typed, not the one on screen", () => {
    const now = now_of({ ...playing, step: 1, typed: "work --ti" });
    expect(now.phase).toBe(Phase.TYPING);
    expect(now.index).toBe(1);
    expect(now.title).toBe("Work");
  });

  test("a held step shows its window and the tour's summary of it", () => {
    const now = now_of({ ...playing, step: 2, beat: "work --timeline" });
    expect(now.phase).toBe(Phase.SHOWING);
    expect(now.index).toBe(1);
    expect(now.detail).toMatch(/While True/);
  });

  test("How I build's pass says which principle is lit and where it is in the pass", () => {
    const now = now_of({ ...playing, step: 4, beat: "how --i-build", lit: "team", cycling: true });
    expect(now.principle).toEqual({ title: "Make the next change easy", at: 2, of: 3 });
  });

  test("a principle the visitor lit is not the tour's", () => {
    expect(now_of({ ...playing, step: 4, beat: "how --i-build", lit: "performance" }).principle).toBeUndefined();
  });

  test("paused and done", () => {
    expect(now_of({ ...playing, tour: "paused", step: 2 })).toMatchObject({ phase: Phase.PAUSED, title: "Projects" });
    expect(now_of({ ...playing, tour: "done", step: 5 }).phase).toBe(Phase.DONE);
  });
});

describe("outcome_of", () => {
  test("a command says what it opened", () => {
    expect(outcome_of("work --timeline", [])).toEqual({ did: Did.OPENED, label: "opened Work" });
    expect(outcome_of("how --i-build", [])?.label).toBe("opened How I build");
    expect(outcome_of('mail "hi"', [])?.label).toBe("opened Contact");
  });

  test("searches, principles, lists and mistakes", () => {
    expect(outcome_of("/svelte", [{ tone: "out" }])?.did).toBe(Did.SEARCHED);
    expect(outcome_of("/decisions", [{ tone: "out", principle: "decisions" }])?.did).toBe(Did.LIT);
    expect(outcome_of("how decisions", [])?.did).toBe(Did.LIT);
    expect(outcome_of("help", [])?.label).toBe("listed commands");
    expect(outcome_of("wrok", [{ tone: "error" }])?.did).toBe(Did.ERROR);
    expect(outcome_of("", [])).toBeNull();
  });
});
