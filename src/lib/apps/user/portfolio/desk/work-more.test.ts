import { describe, expect, test } from "vitest";
import { JOBS } from "../content/experience";
import { engagements_of, first_sentence, overlap, studies_of } from "./work-more";

const job = (id: string) => JOBS.find((candidate) => candidate.id === id)!;

describe("work more", () => {
  test("a job's case studies are its own and its clients'", () => {
    expect(studies_of(job("astra")).map((study) => study.id)).toEqual(["exam-prep", "astra-engineering"]);
    expect(studies_of(job("while-true")).map((study) => study.id)).toEqual(["blurb", "rpi"]);
  });

  test("engagements are nested entries with their own sentence", () => {
    const while_true = job("while-true");
    const entries = engagements_of(while_true);
    expect(entries.map((entry) => entry.engagement.client)).toEqual(while_true.engagements!.map((engagement) => engagement.client));
    for (const entry of entries) expect(entry.line).toBeTruthy();
    expect(entries.find((entry) => entry.engagement.client.startsWith("Cosylab"))?.line).toMatch(/European Space Agency/);
  });

  test("a job without engagements has none", () => {
    expect(engagements_of(job("astra"))).toEqual([]);
  });

  test("overlap is the share of the first text's longer words the second uses", () => {
    expect(overlap("shipped release pipeline", "the release pipeline")).toBeCloseTo(2 / 3);
    expect(overlap("a b c", "anything")).toBe(0);
  });

  test("a sentence ends at a full stop before a space, never inside a number", () => {
    expect(first_sentence("Passes 4.5 : 1 here. Then more.")).toBe("Passes 4.5 : 1 here.");
  });
});
