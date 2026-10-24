import { describe, expect, it } from "vitest";
import { APP_NAMES, app_name } from "./app-names";
import { FEATURES, Level, LEVELS } from "./features";

const MANIFESTS = import.meta.glob<string>("../../apps/*/*/index.ts", { query: "?raw", import: "default", eager: true });
const manifest = (id: string) => Object.entries(MANIFESTS).find(([path]) => path.endsWith(`/${id}/index.ts`))?.[1];
// The fork job deletes every user app; the list may still name them.
const forked = !Object.keys(MANIFESTS).some((path) => path.includes("/user/"));

describe("FEATURES", () => {
  it("has unique ids", () => {
    const ids = FEATURES.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses known levels and dotted versions", () => {
    for (const feature of FEATURES) {
      expect(LEVELS).toContain(feature.level);
      for (const version of Object.values(feature.min)) {
        if (version !== null) expect(version, feature.id).toMatch(/^\d+(\.\d+)?$/);
      }
    }
  });

  it("names apps on every apps-level entry", () => {
    for (const feature of FEATURES.filter((item) => item.level === Level.APPS)) {
      expect(feature.apps?.length, feature.id).toBeGreaterThan(0);
    }
  });

  it.skipIf(forked)("names only apps that exist, each with its display name", () => {
    const referenced = new Set(FEATURES.flatMap((feature) => feature.apps ?? []));
    for (const id of referenced) {
      expect(manifest(id), `no app "${id}"`).toBeDefined();
      expect(APP_NAMES[id], `APP_NAMES has no "${id}"`).toBeDefined();
    }
    for (const [id, name] of Object.entries(APP_NAMES)) {
      expect(referenced.has(id), `APP_NAMES has unused "${id}"`).toBe(true);
      expect(/^\s*name: "([^"]+)"/m.exec(manifest(id) ?? "")?.[1], id).toBe(name);
    }
  });
});

describe("app_name", () => {
  it("falls back to the id in words", () => {
    expect(app_name("paint")).toBe("Paint");
    expect(app_name("my-portfolio")).toBe("My portfolio");
  });
});
