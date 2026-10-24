import { describe, expect, test } from "vitest";
import { JOBS } from "../content/experience";
import { Publication, type Job } from "../content/types";
import { as_line, axis_years, full_years, job_line, newest_first, site_of, units_of } from "./work-units";

describe("work units", () => {
  test("every job gets a line and units with a line each", () => {
    for (const job of JOBS) {
      expect(job_line(job)).not.toBe("");
      const units = units_of(job);
      expect(units.length).toBeGreaterThan(1);
      expect(units.every((unit) => unit.line.length > 0)).toBe(true);
    }
  });

  test("lines drop the place and the I, and keep the first clause", () => {
    expect(as_line("At Blurb, I co-developed Wall Art, and more.")).toBe("Co-developed Wall Art");
    expect(as_line("I also contributed to a project for Cosylab.")).toBe("Contributed to a project for Cosylab");
  });

  test("years are written in full", () => {
    expect(full_years("Nov 2019 – Jan 2025")).toBe("2019–2025");
    expect(full_years("Jan 2025 – Oct 2025")).toBe("2025");
  });

  test("Cosylab's sentence is told once, in its unit", () => {
    const text = JSON.stringify(JOBS.map((job) => [job_line(job), units_of(job)]));
    expect(text.match(/European Space Agency/g)).toHaveLength(1);
  });

  test("the linked units carry their site", () => {
    const links = JOBS.flatMap(units_of).flatMap((unit) => (unit.link ? [unit.link.label] : []));
    expect(links).toEqual(["Exam Prep", "Wall Art", "Self-service"]);
  });

  test("each year of the axis belongs to one job, a January hand-over to the newer one", () => {
    const axis = axis_years([
      { id: "astra", period: "Jan 2025 – Oct 2026" },
      { id: "while-true", period: "Nov 2019 – Jan 2025" },
    ]);
    expect(axis).toEqual([
      { id: "while-true", years: [2019, 2020, 2021, 2022, 2023, 2024] },
      { id: "astra", years: [2025, 2026] },
    ]);
  });

  test("a year shared mid-way goes to the job with more of its months", () => {
    const axis = axis_years([
      { id: "old", period: "Jan 2020 – Apr 2022" },
      { id: "new", period: "Apr 2022 – Dec 2023" },
    ]);
    expect(axis).toEqual([
      { id: "old", years: [2020, 2021] },
      { id: "new", years: [2022, 2023] },
    ]);
  });

  test("a job without a readable period stays off the axis", () => {
    expect(axis_years([{ id: "x", period: "sometime" }])).toEqual([]);
  });

  test("a company site shows only once the entry has one", () => {
    const bare: Job = { id: "x", company: "X", title: "", period: "", place: "", summary: { status: Publication.OK, paragraphs: [] }, links: [] };
    expect(site_of(bare)).toBe(null);
    expect(site_of({ ...bare, url: "https://example.com" } as Job)).toBe("https://example.com");
  });
});

describe("newest_first", () => {
  test("While True reads from its latest work down to where it began, matching the CV's ranges", () => {
    const job = JOBS.find((entry) => entry.id === "while-true")!;
    const units = newest_first(units_of(job));
    expect(units.map((unit) => [unit.name, unit.years])).toEqual([
      ["WT.dev & internal", ""],
      ["RPI Print", "2020–2024"],
      ["Cosylab", "2020"],
      ["Blurb", "2019–2024"],
    ]);
  });
});
