import { describe, expect, test } from "vitest";
import { parse_roadmap } from "$kit/utils/roadmap";
import { AdrStatus, adr_header, count_revisions, parse_adr_index, status_kind } from "./adr-index";
import { service_graph, is_swapped } from "./graph";
import { world_map } from "./map-layout";
import { outline, slugify } from "./outline";
import { opfs_area, parse_storage_map, split_row } from "./persistence";
import { load_page, PAGE_SET } from "./pages";

// These read the real docs: a change to the shapes the app parses fails here, not silently in the app.
describe("docs/adrs/README.md", async () => {
  const readme = await load_page("adrs/README");
  const entries = parse_adr_index(readme);

  test("every index row parses, in order, pointing at a real page", () => {
    expect(entries.length).toBeGreaterThan(70);
    expect(entries.map((entry) => entry.number)).toEqual(entries.map((_, index) => index + 1));
    for (const entry of entries) {
      expect(PAGE_SET.has(entry.id), entry.id).toBe(true);
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("statuses fall into the timeline's kinds", () => {
    expect(entries.filter((entry) => entry.kind === AdrStatus.IMPLEMENTED).length).toBeGreaterThan(50);
    expect(status_kind("Implemented (no swap/state yet)")).toBe(AdrStatus.IMPLEMENTED);
    expect(status_kind("Superseded by ADR-033")).toBe(AdrStatus.SUPERSEDED);
    expect(status_kind("Rejected")).toBe(AdrStatus.CLOSED);
  });

  test("ADRs carry a header and revision notes the counter sees", async () => {
    const adr = await load_page(entries[15].id);
    expect(adr_header(adr)?.date).toMatch(/^\d{4}-/);
    expect(count_revisions(await load_page("adrs/016-mobile-support"))).toBeGreaterThanOrEqual(8);
  });
});

test("count_revisions reads every shape", () => {
  const md = `# ADR
> **Revision 2026-10-15: one.** text

## Revision 2026-10-22: two

## Revisions
- **2026-10-21:** three
**2026-10-23 (implementation).**

## Consequences
- **2026-10-24** not a revision
`;
  expect(count_revisions(md)).toBe(4);
});

describe("docs/system/persistence.md", async () => {
  const map = parse_storage_map(await load_page("system/persistence"));

  test("the storage map has OPFS, localStorage and their owners", () => {
    expect(map.entries.length).toBeGreaterThan(20);
    const settings = map.entries.find((entry) => entry.key === "/etc/settings.json");
    expect(settings).toMatchObject({ store: "OPFS", owner: "SettingsService" });
    expect(map.entries.some((entry) => entry.store === "localStorage")).toBe(true);
    expect(map.entries.every((entry) => entry.owner.length > 0)).toBe(true);
  });

  test("the app keys table parses", () => {
    expect(map.app_keys.find((item) => item.key === "app.calculator.history")?.app).toBe("system/calculator");
  });

  test("rows keep pipes inside code and escapes", () => {
    expect(split_row("| a | `x|y` | b\\|c |")).toEqual(["a", "`x|y`", "b|c"]);
    expect(opfs_area("/var/lib/session/session.json")).toBe("/var/lib");
    expect(opfs_area("/etc/fonts/")).toBe("/etc");
  });
});

test("docs/ROADMAP.md parses into sections", async () => {
  const sections = parse_roadmap(await load_page("ROADMAP"));
  expect(sections.length).toBeGreaterThan(5);
});

describe("outline", () => {
  test("slugs match GitHub's anchors", () => {
    expect(slugify("Behaviour & invariants")).toBe("behaviour--invariants");
    expect(slugify("`init()` order")).toBe("init-order");
  });

  test("reads the title and sections, skipping code", () => {
    const result = outline("# Title\n\n## One\n```\n## not a heading\n```\n### Two\n## One\n");
    expect(result.title).toBe("Title");
    expect(result.headings.map((heading) => heading.slug)).toEqual(["one", "two", "one-1"]);
  });
});

describe("service graph", () => {
  const services = [
    { key: "files", name: "FilesService", dependencies: [] },
    { key: "windows", name: "MobileWindowsService", dependencies: [] },
    { key: "settings", name: "SettingsService", dependencies: ["files"] },
    { key: "apps", name: "AppsService", dependencies: ["windows", "settings"] },
  ];
  const graph = service_graph(services);

  test("puts each service one layer after its deepest dependency", () => {
    expect(graph.nodes.map((node) => [node.key, node.layer, node.row, node.order])).toEqual([
      ["files", 0, 0, 1],
      ["windows", 0, 1, 2],
      ["settings", 1, 0, 3],
      ["apps", 2, 0, 4],
    ]);
    expect(graph.nodes[0].dependents).toEqual(["settings"]);
    expect(graph.edges).toHaveLength(3);
  });

  test("spots swapped classes", () => {
    expect(services.filter(is_swapped).map((service) => service.key)).toEqual(["windows"]);
  });

  test("the world map places every cluster without overlap", () => {
    const map = world_map({
      services,
      shell: [["system/shell/desktop", "Desktop"]],
      design: [["design/foundations", "Foundations"]],
      system_apps: [{ id: "settings", name: "Settings", slug: "settings" }],
      user_apps: 3,
      stores: [{ label: "/etc", detail: "", hash: "storage-map" }],
      adrs: { total: 2, latest: [{ id: "adrs/002-x", label: "002 X" }] },
    });
    const boxes = map.clusters;
    for (const a of boxes) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      for (const b of boxes) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.key} / ${b.key}`).toBe(true);
      }
    }
    expect(map.nodes.find((node) => node.key === "app:user")?.label).toBe("3 user apps");
  });
});
