import { describe, expect, test } from "vitest";
import { Win } from "./script";
import { HitKind, HITS, search } from "./search";

describe("search", () => {
  test("a project name prefix ranks that project first", () => {
    expect(search("chrom")[0]).toMatchObject({ kind: HitKind.PROJECT, window: Win.PROJECTS, project: "chromatics" });
  });

  test("the colour library has its own card, found by name, npm name and what it is", () => {
    expect(search("chrom").map((hit) => hit.project)).toContain("chromatics-package");
    expect(search("@lilbunnyrabbit/chromatics")[0]).toMatchObject({ kind: HitKind.PROJECT, window: Win.PROJECTS, project: "chromatics-package" });
    expect(search("colour model")[0]).toMatchObject({ kind: HitKind.PROJECT, project: "chromatics-package" });
  });

  test("an in-progress project is found and opens Side projects on its card", () => {
    expect(search("animot")[0]).toMatchObject({ kind: HitKind.PROJECT, window: Win.PROJECTS, project: "animot", detail: "In progress" });
  });

  test("a client finds the job it belongs to", () => {
    expect(search("blurb")[0]).toMatchObject({ kind: HitKind.JOB, window: Win.TIMELINE, job: "while-true" });
  });

  test("a principle lights up its evidence instead of opening a window, and names where it shows up", () => {
    const [hit] = search("where it runs");
    expect(hit).toMatchObject({ kind: HitKind.PRINCIPLE, principle: "tested", detail: "Astra AI, WebOS, chromatics, Petrace, hq, chrome-safe-inset" });
    expect(hit.window).toBeUndefined();
  });

  test("every word has to match", () => {
    expect(search("svelte tmux")).toEqual([]);
  });

  test("links point at the contact window", () => {
    const links = HITS.filter((hit) => hit.kind === HitKind.LINK);
    expect(links.map((hit) => hit.label)).toEqual(["Email", "LinkedIn", "GitHub", "X", "npm"]);
    expect(search("linked")[0].window).toBe(Win.CONTACT);
  });

  test("a skill finds itself first and opens the latest work that names it, through its framework too", () => {
    const hits = search("react");
    expect(hits[0]).toMatchObject({ kind: HitKind.SKILL, label: "React", window: Win.TIMELINE, job: "astra" });
    expect(hits.filter((hit) => hit.kind === HitKind.JOB).map((hit) => hit.job)).toEqual(["astra", "while-true"]);
  });

  test("a job is found by what its case studies tell", () => {
    expect(search("streaming")[0]).toMatchObject({ kind: HitKind.JOB, job: "astra" });
    expect(search("wall art").some((hit) => hit.kind === HitKind.JOB && hit.job === "while-true")).toBe(true);
  });

  test("a job is found by what its highlights say", () => {
    expect(search("exam prep").some((hit) => hit.kind === HitKind.JOB && hit.job === "astra")).toBe(true);
  });

  test("a skill only a project uses opens that project", () => {
    expect(search("codemirror")[0]).toMatchObject({ kind: HitKind.SKILL, window: Win.PROJECTS });
  });

  test("an empty query lists jobs and projects, capped", () => {
    const hits = search("");
    expect(hits).toHaveLength(6);
    expect(hits.every((hit) => hit.kind !== HitKind.PRINCIPLE)).toBe(true);
  });
});
