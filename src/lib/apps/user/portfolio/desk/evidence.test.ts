import { describe, expect, test } from "vitest";
import { PRINCIPLES } from "../content/principles";
import { FEATURED } from "../content/projects";
import {
  EVIDENCE,
  evidence_names,
  how_for,
  principles_for_job,
  principles_for_project,
  proof_for,
  proof_place,
  PROJECTS,
  PROVING,
  SHOWN,
  SHOWN_MAX,
  shows_in,
  TOUR_PRINCIPLES,
  work_block,
  WORK_PROOF,
} from "./evidence";

const principle = (id: string) => PRINCIPLES.find((p) => p.id === id)!;
const project = (id: string) => PROVING.find((p) => p.id === id)!;

describe("evidence", () => {
  test("a project shows a principle when the proof names it or its own `shows` says how", () => {
    expect(shows_in(principle("decisions"), project("webos"))).toBe(true);
    expect(shows_in(principle("decisions"), project("chromatics"))).toBe(true);
    expect(shows_in(principle("tested"), project("chromatics"))).toBe(false);
    expect(shows_in(principle("decisions"), project("brand"))).toBe(true);
    expect(shows_in(principle("team"), project("task-manager"))).toBe(true);
  });

  test("comes from each principle's proof text, the projects' `shows` and the mapped work case studies", () => {
    expect(EVIDENCE.decisions).toEqual({ jobs: [], projects: ["webos", "chromatics", "petrace", "hq", "brand"] });
    expect(EVIDENCE.team).toEqual({ jobs: ["astra"], projects: ["task-manager", "hq", "packages"] });
    expect(EVIDENCE.feel).toEqual({ jobs: ["astra"], projects: ["chromatics", "petrace", "series-tracker"] });
    expect(EVIDENCE.performance).toEqual({ jobs: ["astra"], projects: ["webos", "chromatics"] });
    for (const p of PROVING) for (const id of Object.keys(p.shows ?? {})) expect(EVIDENCE[id].projects).toContain(p.id);
  });

  test("every principle shows up somewhere the tour opens", () => {
    for (const p of PRINCIPLES) expect(evidence_names(p.id).length).toBeGreaterThan(0);
  });

  test("jobs and projects list the principles they prove", () => {
    expect(principles_for_job("astra").map((p) => p.id)).toEqual(["team", "performance", "feel"]);
    expect(principles_for_job("while-true")).toEqual([]);
    expect(principles_for_project("chromatics").map((p) => p.id)).toEqual(["decisions", "performance", "feel"]);
    expect(principles_for_project("agtc").map((p) => p.id)).toEqual(["lightest"]);
  });

  test("names read jobs first, then projects", () => {
    expect(evidence_names("team")).toEqual(["Astra AI", "Task Manager", "hq", "TypeScript packages"]);
    expect(evidence_names("nope")).toEqual([]);
  });

  test("a card labels at most three principles, the tour's first, in their own order", () => {
    expect(principles_for_project("webos").map((p) => p.id)).toEqual(["decisions", "lightest", "performance"]);
    for (const p of PROVING) expect(principles_for_project(p.id).length).toBeLessThanOrEqual(SHOWN_MAX);
  });

  test("what the tour lights is always labelled where it lights, on every card that shows it", () => {
    for (const id of TOUR_PRINCIPLES) expect(SHOWN[id].jobs.length + SHOWN[id].projects.length).toBeGreaterThan(0);
    expect(SHOWN.decisions).toEqual({ jobs: [], projects: ["webos", "chromatics", "petrace", "hq", "brand"] });
    expect(SHOWN.team.jobs).toEqual(["astra"]);
    expect(SHOWN.feel.projects).toEqual(["chromatics", "petrace", "series-tracker"]);
    for (const p of FEATURED) if (p.shows) expect(principles_for_project(p.id).length).toBeGreaterThan(0);
  });

  test("a project's own `shows` sentence is its part of the proof", () => {
    const decisions = principle("decisions");
    expect(proof_for(decisions, "Chromatics")).toBe(project("chromatics").shows!.decisions);
    expect(how_for(decisions, "Petrace")).toEqual({ text: project("petrace").shows!.decisions, status: project("petrace").status });
    expect(proof_for(principle("tested"), "Chromatics")).toBeNull();
  });

  test("the how is the part of the proof about that one place", () => {
    const decisions = principle("decisions");
    expect(proof_for(decisions, "WebOS")).toBe(decisions.proof);
    const performance = principle("performance");
    expect(proof_for(performance, "Astra AI")).toBe("At Astra AI I virtualized long tutor conversations.");
    expect(proof_for(performance, "WebOS")).toMatch(/^WebOS loads each app only when it opens/);
    const lightest = principle("lightest");
    expect(proof_for(lightest, "WebOS")).toBe(lightest.proof);
    expect(proof_for(lightest, "Astra AI")).toBeNull();
  });

  test("the proof is told at one labelled place: a project first, then a job", () => {
    expect(proof_place("decisions")).toBe("WebOS");
    expect(proof_place("feel")).toBe("Chromatics");
    expect(proof_place("tested")).toBe("hq");
    for (const id of TOUR_PRINCIPLES) expect(proof_place(id)).not.toBeNull();
  });

  test("every mapped work proof is a published case-study block, and a job mark tells it", () => {
    for (const [id, proof] of Object.entries(WORK_PROOF)) {
      const block = work_block(id, proof.job);
      expect(block).not.toBeNull();
      expect(how_for(principle(id), "Astra AI")?.text).toBe((block!.paragraphs ?? []).join(" "));
    }
    const lightest = principle("lightest");
    expect(how_for(lightest, "WebOS")?.text).toBe(lightest.proof);
    expect(how_for(lightest, "Astra AI")).toBeNull();
  });

  test("the featured projects are still the cards the tour plays", () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(["webos", ...FEATURED.map((p) => p.id)]);
  });
});
