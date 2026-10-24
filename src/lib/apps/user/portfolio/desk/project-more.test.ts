import { describe, expect, test } from "vitest";
import { ALSO, FEATURED, IN_PROGRESS, MORE } from "../content/projects";
import { LinkKind } from "../content/types";
import { more_row, MoreLayout, now_of, tile_count } from "./project-more";

describe("smaller things", () => {
  test("packages with an npm page and a repo each become one sub-row", () => {
    const packages = more_row(MORE.find((project) => project.id === "packages")!, true);
    expect(packages.layout).toBe(MoreLayout.GROUPED);
    expect(packages.groups.map((group) => group.name)).toEqual(["optional", "event-emitter", "utils", "service-observer"]);
    expect(packages.groups.every((group) => !!group.line)).toBe(true);
    expect(packages.groups[1].line).toBe("A lightweight, type-safe event emitter.");
    for (const group of packages.groups) {
      expect(group.links.map((link) => link.kind).slice(0, 2)).toEqual([LinkKind.NPM, LinkKind.SOURCE]);
      expect(group.links.every((link) => link.label === undefined)).toBe(true);
    }
  });

  test("unique labels stay written out, unlabelled links become icons", () => {
    expect(more_row({ ...ALSO[0], links: ALSO[0].links.map((link, i) => ({ ...link, label: `link ${i}` })) }, true).layout).toBe(MoreLayout.LABELLED);
    expect(more_row(MORE.find((project) => project.id === "brand")!, true).layout).toBe(MoreLayout.ICONS);
  });

  test("the count names every tile, one per package", () => {
    expect(tile_count([...MORE, ...ALSO])).toBe(MORE.length + ALSO.length + 3);
  });

  test("an in-progress project says what is being done now", () => {
    for (const project of IN_PROGRESS) expect(now_of(project)).toBeTruthy();
    expect(now_of(IN_PROGRESS.find((project) => project.id === "animot")!)).toBe("planning the MVP and prototyping how a directed reading feels.");
  });

  test("a phone-first note shows only on desktop", () => {
    const petrace = FEATURED.find((project) => project.id === "petrace")!;
    expect(more_row(petrace, true).note).toBe(petrace.note);
    expect(more_row(petrace, false).note).toBeUndefined();
  });
});
