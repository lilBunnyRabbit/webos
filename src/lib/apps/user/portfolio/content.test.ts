import { describe, expect, test } from "vitest";
import { engagement_line, JOBS } from "./content/experience";
import { PROFILE } from "./content/profile";
import { ALSO, FEATURED, IN_PROGRESS, MORE, WEBOS_CARD } from "./content/projects";
import { SKILLS } from "./content/skills";
import { LinkKind, Publication, type Link } from "./content/types";
import { CASE_STUDIES } from "./content/work";
import { app_href } from "./links";
import { PRINCIPLES, PRINCIPLES_INTRO } from "./content/principles";

const APPS = new Set(Object.keys(import.meta.glob("/src/lib/apps/*/*/index.ts")).map((path) => path.split("/").at(-2)));
const ADRS = new Set(Object.keys(import.meta.glob("/docs/adrs/*.md")).map((path) => path.split("/").at(-1)!.replace(/\.md$/, "")));

const APP_SOURCES = import.meta.glob(["/src/lib/apps/user/portfolio/{desk,particles}/**/*.{ts,svelte}", "/src/lib/apps/user/portfolio/*.{ts,svelte}", "!**/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const CONTENT = { PROFILE, JOBS, CASE_STUDIES, FEATURED, MORE, ALSO, IN_PROGRESS, WEBOS_CARD, SKILLS, PRINCIPLES, PRINCIPLES_INTRO };
const TEXT = JSON.stringify(CONTENT);

// The never-publish list from the cv repo's portfolio brief (§5), as phrases a slip would contain.
const NEVER = [
  /\+386|tel:|phone number/i,
  /posthog\s+(figure|data|number)/i,
  /15M|194 countries|\$25M|\bARR\b|25×|Startup of the Year/,
  /pdf-to-book/i,
  /TesterArmy/i,
  /\bstars?\b|downloads|commit count/i,
  /sole frontend|European Space Agency (mission|ground|software)/i,
  /self-updating|single-handedly|visionary|10x|revolutioni[sz]ed/i,
  /\bmanaged\b|\bhired\b|mentored the team/i,
  /\/showcase/,
  /Lingui|paper mode/i,
];

function links(value: unknown): Link[] {
  if (Array.isArray(value)) return value.flatMap(links);
  if (!value || typeof value !== "object") return [];
  if ("kind" in value && Object.values(LinkKind).includes((value as Link).kind)) return [value as Link];
  return Object.values(value).flatMap(links);
}

function statuses(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(statuses);
  if (!value || typeof value !== "object") return [];
  const own = "status" in value ? [(value as { status: unknown }).status] : [];
  return [...own, ...Object.values(value).flatMap(statuses)];
}

describe("portfolio content", () => {
  test.each(NEVER)("never says %s", (pattern) => {
    expect(TEXT).not.toMatch(pattern);
  });

  test.each(NEVER)("no window's own copy says %s", (pattern) => {
    const hits = Object.entries(APP_SOURCES).filter(([, source]) => pattern.test(source)).map(([path]) => path);
    expect(hits).toEqual([]);
  });

  test("every block is approved or a draft", () => {
    const found = statuses(CONTENT);
    expect(found.length).toBeGreaterThan(20);
    expect(found.filter((status) => !Object.values(Publication).includes(status as Publication))).toEqual([]);
  });

  test("every engagement finds its own sentence in the job summary", () => {
    for (const job of JOBS) {
      const lines = (job.engagements ?? []).map((engagement) => engagement_line(job, engagement));
      expect(lines.every((line) => line !== null)).toBe(true);
      expect(new Set(lines).size).toBe(lines.length);
    }
  });

  test("every project's `shows` names a real principle", () => {
    const ids = new Set(PRINCIPLES.map((principle) => principle.id));
    const keys = [WEBOS_CARD, ...FEATURED, ...MORE, ...IN_PROGRESS].flatMap((project) => Object.keys(project.shows ?? {}));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !ids.has(key))).toEqual([]);
  });

  test("Cosylab gets the LinkedIn sentence and nothing more", () => {
    expect(TEXT.match(/European Space Agency/g)).toHaveLength(1);
    expect(TEXT).toContain("a project for Cosylab involving the European Space Agency");
  });

  test("external links are https and webos links name an app", () => {
    for (const link of links(CONTENT)) {
      if (link.kind === LinkKind.WEBOS) expect(link.app).toMatch(/^[a-z0-9-]+$/);
      else expect(link.url).toMatch(/^https:\/\//);
    }
  });

  test("Open in WebOS points at apps that ship with WebOS", () => {
    const targets = links(CONTENT).flatMap((link) => (link.kind === LinkKind.WEBOS ? [link.app] : []));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.filter((app) => !APPS.has(app))).toEqual([]);
  });

  test("every ADR a decision cites exists", () => {
    const missing = PRINCIPLES.flatMap((item) => item.adrs).filter((adr) => !ADRS.has(adr));
    expect(missing).toEqual([]);
  });
});

describe("app_href", () => {
  test("keeps strings raw and JSON-encodes the rest, the way the router reads them back", () => {
    expect(app_href("activity-monitor", { section: "tasks" })).toBe("#/app/activity-monitor?section=tasks");
    expect(app_href("x", { count: 3, skip: undefined })).toBe("#/app/x?count=3");
    expect(app_href("time-since")).toBe("#/app/time-since");
  });
});
