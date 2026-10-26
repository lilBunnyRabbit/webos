import { describe, expect, test } from "vitest";
import { adr_number, build_aliases, fallback_title, group_of, page_id, resolve_link, resolve_page, short_name, suggest_pages } from "./catalog";
import { ALIASES, find_page, locate, PAGE_IDS } from "./pages";

const IDS = [
  "ROADMAP",
  "adrs/README",
  "adrs/047-solo-app-open",
  "apps/README",
  "apps/warren",
  "design/README",
  "design/shell",
  "system/README",
  "system/persistence",
  "system/services/apps",
  "system/services/shell",
  "system/services/windows",
  "system/shell/desktop",
  "system/shell/mobile",
];
const ALIAS = build_aliases(IDS);
const SET = new Set(IDS);

describe("page ids", () => {
  test("come from the path under docs/", () => {
    expect(page_id("/docs/system/services/windows.md")).toBe("system/services/windows");
    expect(page_id("/docs/ROADMAP.md")).toBe("ROADMAP");
  });

  test("fall into the sidebar groups", () => {
    expect(IDS.map(group_of)).toEqual([
      "roadmap", "adrs", "adrs", "apps", "apps", "design", "design", "system", "system", "services", "services", "services", "shell", "shell",
    ]);
  });

  test("read titles before the page loads", () => {
    expect(fallback_title("adrs/047-solo-app-open")).toBe("ADR-047: Solo app open");
    expect(fallback_title("system/services/windows")).toBe("Windows");
    expect(adr_number("adrs/README")).toBeNull();
  });
});

describe("resolve_page", () => {
  test.each([
    ["system/services/windows", "system/services/windows"],
    ["windows", "system/services/windows"],
    ["services/windows", "system/services/windows"],
    ["docs/system/services/windows.md", "system/services/windows"],
    ["adr 47", "adrs/047-solo-app-open"],
    ["ADR-047", "adrs/047-solo-app-open"],
    ["adrs/047", "adrs/047-solo-app-open"],
    ["47", "adrs/047-solo-app-open"],
    ["solo-app-open", "adrs/047-solo-app-open"],
    ["persistence", "system/persistence"],
    ["shell", "system/services/shell"],
    ["shell/desktop", "system/shell/desktop"],
    ["apps", "apps/README"],
    ["services/apps", "system/services/apps"],
    ["roadmap", "ROADMAP"],
    ["design/shell", "design/shell"],
  ])("%s → %s", (topic, id) => {
    expect(resolve_page(IDS, ALIAS, topic)).toBe(id);
  });

  test("an unknown name resolves to nothing but suggests near pages", () => {
    expect(resolve_page(IDS, ALIAS, "window")).toBeNull();
    expect(suggest_pages(IDS, ALIAS, "window")[0]).toBe("system/services/windows");
  });

  test("short names are the shortest alias", () => {
    expect(short_name("system/services/windows", ALIAS)).toBe("windows");
    expect(short_name("system/shell/mobile", ALIAS)).toBe("mobile");
    expect(short_name("design/shell", ALIAS)).toBe("design/shell");
  });
});

describe("resolve_link", () => {
  test("relative links between docs open in place, with their anchor", () => {
    expect(resolve_link("system/services/windows", "../shell/mobile.md#back", SET)).toEqual({ kind: "doc", id: "system/shell/mobile", hash: "back" });
    expect(resolve_link("ROADMAP", "adrs/047-solo-app-open.md", SET)).toEqual({ kind: "doc", id: "adrs/047-solo-app-open", hash: "" });
    expect(resolve_link("system/README", "../apps/", SET)).toEqual({ kind: "doc", id: "apps/README", hash: "" });
  });

  test("anchors stay in the page", () => {
    expect(resolve_link("system/persistence", "#storage-map", SET)).toEqual({ kind: "anchor", hash: "storage-map" });
  });

  test("brainstorms, source files and the web open outside", () => {
    expect(resolve_link("adrs/047-solo-app-open", "../brainstorm/2026-10-19_solo.md", SET)).toEqual({
      kind: "external",
      url: "https://github.com/lilBunnyRabbit/webos/blob/master/docs/brainstorm/2026-10-19_solo.md",
    });
    expect(resolve_link("system/README", "../../src/lib/core/api/index.ts", SET)).toEqual({
      kind: "external",
      url: "https://github.com/lilBunnyRabbit/webos/blob/master/src/lib/core/api/index.ts",
    });
    expect(resolve_link("system/README", "https://example.com", SET)).toEqual({ kind: "external", url: "https://example.com" });
  });
});

describe("the bundled docs", () => {
  test("hold every group and the names the brainstorm promised", () => {
    expect(new Set(PAGE_IDS.map(group_of))).toEqual(new Set(["system", "services", "shell", "adrs", "design", "apps", "roadmap"]));
    expect(find_page("windows")).toBe("system/services/windows");
    expect(find_page("persistence")).toBe("system/persistence");
    expect(find_page("adr 47")).toMatch(/^adrs\/047-/);
    expect(locate("persistence#storage-map")).toEqual({ id: "system/persistence", hash: "storage-map" });
    expect(PAGE_IDS.some((id) => id.startsWith("brainstorm/"))).toBe(false);
    expect(ALIASES.size).toBeGreaterThan(PAGE_IDS.length);
  });
});
