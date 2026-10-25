import { describe, expect, it } from "vitest";
import { SOLO_PREFIX } from "../api/kernel/mode";
import { Engine, type Browser } from "./browser";
import {
  check,
  fixed_by_update,
  in_scope,
  next_dismissed,
  parse_dismissed,
  requirement,
  should_show,
  solo_app,
  SOLO_HASH,
  status,
  Status,
  type CompatResult,
} from "./check";
import { FEATURES, Level, type Feature } from "./features";

const feature = (id: string, level: Level = Level.SHELL, apps?: string[]): Feature => ({
  id,
  name: id,
  lost: "",
  level,
  apps,
  min: { chrome: "129", firefox: "147", safari: null },
  probe: () => true,
});

const browser = (engine: Engine | null, engine_version: string | null, name = "Chrome", os = "macOS"): Browser => ({
  name,
  version: engine_version,
  os,
  engine,
  engine_version,
});

const results = (statuses: Record<string, Status>): CompatResult[] =>
  Object.entries(statuses).map(([id, value]) => ({ feature: feature(id), status: value }));

describe("status", () => {
  const anchor = feature("anchor");

  it("is missing when the probe fails, whatever the version", () => {
    expect(status(anchor, browser(Engine.CHROMIUM, "141"), false)).toBe(Status.MISSING);
  });

  it("is outdated when the probe passes on an engine older than min", () => {
    expect(status(anchor, browser(Engine.CHROMIUM, "125"), true)).toBe(Status.OUTDATED);
    expect(status(anchor, browser(Engine.GECKO, "146", "Firefox"), true)).toBe(Status.OUTDATED);
  });

  it("is outdated when the probe passes where the engine never shipped it", () => {
    expect(status(anchor, browser(Engine.WEBKIT, "26", "Safari"), true)).toBe(Status.OUTDATED);
  });

  it("is ok at or above min", () => {
    expect(status(anchor, browser(Engine.CHROMIUM, "129"), true)).toBe(Status.OK);
    expect(status(anchor, browser(Engine.GECKO, "152", "Firefox"), true)).toBe(Status.OK);
  });

  it("trusts the probe alone for an unknown browser or version", () => {
    expect(status(anchor, browser(null, null), true)).toBe(Status.OK);
    expect(status(anchor, browser(Engine.WEBKIT, null, "Chrome", "iOS"), true)).toBe(Status.OK);
  });

  it("treats a throwing probe as missing", () => {
    const broken = { ...anchor, probe: () => { throw new Error("no"); } };
    expect(status(broken, browser(Engine.CHROMIUM, "141"))).toBe(Status.MISSING);
  });
});

describe("check", () => {
  it("runs every probe once", () => {
    const seen: string[] = [];
    const out = check([feature("a"), feature("b")], browser(Engine.CHROMIUM, "141"), (item) => {
      seen.push(item.id);
      return item.id === "a";
    });
    expect(seen).toEqual(["a", "b"]);
    expect(out.map((result) => result.status)).toEqual([Status.OK, Status.MISSING]);
  });
});

describe("solo scope", () => {
  it("reads the app id from a solo hash", () => {
    expect(solo_app("#/solo/paint")).toBe("paint");
    expect(solo_app("#/solo/portfolio?tab=work")).toBe("portfolio");
    expect(solo_app("#/app/paint")).toBeNull();
    expect(solo_app("")).toBeNull();
    expect(solo_app("#/solo/")).toBeNull();
  });

  it("matches the kernel's solo prefix", () => {
    expect(SOLO_HASH).toBe(SOLO_PREFIX);
  });

  it("keeps everything in full WebOS", () => {
    expect(FEATURES.every((item) => in_scope(item, null))).toBe(true);
  });

  it("keeps start blockers and the app's own entries in solo", () => {
    expect(in_scope(feature("opfs", Level.START), "paint")).toBe(true);
    expect(in_scope(feature("eyedropper", Level.APPS, ["paint"]), "paint")).toBe(true);
    expect(in_scope(feature("popover", Level.SHELL, ["paint", "warren"]), "paint")).toBe(true);
    expect(in_scope(feature("closedby", Level.SHELL), "paint")).toBe(false);
    expect(in_scope(feature("backdrop", Level.COSMETIC), "paint")).toBe(false);
    expect(in_scope(feature("webhid", Level.APPS, ["hid-lab"]), "paint")).toBe(false);
  });

  it("leaves an app with no entries only the start blockers", () => {
    const scoped = FEATURES.filter((item) => in_scope(item, "tic-tac-toe"));
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((item) => item.level === Level.START)).toBe(true);
  });
});

describe("dismissal", () => {
  it("parses only a list of strings", () => {
    expect(parse_dismissed('["a","b"]')).toEqual(["a", "b"]);
    expect(parse_dismissed('["a",1]')).toEqual(["a"]);
    expect(parse_dismissed("{}")).toEqual([]);
    expect(parse_dismissed("not json")).toEqual([]);
    expect(parse_dismissed(null)).toEqual([]);
  });

  it("shows only when something outside the dismissed set is wrong", () => {
    const now = results({ a: Status.MISSING, b: Status.OUTDATED, c: Status.OK });
    expect(should_show(now, [])).toBe(true);
    expect(should_show(now, ["a"])).toBe(true);
    expect(should_show(now, ["a", "b"])).toBe(false);
    expect(should_show(results({ c: Status.OK }), [])).toBe(false);
  });

  it("stores the sorted ids of what is wrong now, replacing the old set in full WebOS", () => {
    const now = results({ z: Status.OUTDATED, a: Status.MISSING, c: Status.OK });
    expect(next_dismissed(["old"], now, false)).toEqual(["a", "z"]);
  });

  it("adds to the old set from a solo link", () => {
    const now = results({ z: Status.MISSING });
    expect(next_dismissed(["a", "z"], now, true)).toEqual(["a", "z"]);
    expect(next_dismissed(["b"], now, true)).toEqual(["b", "z"]);
  });
});

describe("requirement", () => {
  const anchor = feature("anchor");

  it("names the update for the detected engine", () => {
    expect(requirement(anchor, browser(Engine.CHROMIUM, "125"))).toBe("Update to Chrome 129 or later");
    expect(requirement(anchor, browser(Engine.CHROMIUM, "125", "Edge"))).toBe("Update to Edge 129 or later");
    expect(requirement(anchor, browser(Engine.CHROMIUM, "125", "Opera"))).toBe("Needs Chromium 129 or later");
    expect(requirement(anchor, browser(Engine.GECKO, "140", "Firefox"))).toBe("Update to Firefox 147 or later");
  });

  it("says when the engine doesn't have it", () => {
    expect(requirement(anchor, browser(Engine.WEBKIT, "18.4", "Safari"))).toBe("Not available in Safari yet");
    expect(requirement(anchor, browser(Engine.WEBKIT, "18.4", "Chrome", "iOS"))).toBe("Not available on iOS yet");
  });

  it("asks iOS browsers to update iOS", () => {
    const popover = { ...anchor, min: { chrome: "114", firefox: "125", safari: "18.3" } };
    expect(requirement(popover, browser(Engine.WEBKIT, "17.5", "Firefox", "iOS"))).toBe("Update to iOS 18.3 or later");
  });

  it("says the OS lacks it when the version is already past min", () => {
    expect(requirement(anchor, browser(Engine.CHROMIUM, "155", "Chrome", "Windows"))).toBe("Not available in Chrome on Windows");
    const popover = { ...anchor, min: { chrome: "114", firefox: "125", safari: "18.3" } };
    expect(requirement(popover, browser(Engine.WEBKIT, "26", "Chrome", "iOS"))).toBe("Not available on iOS");
  });

  it("lists every engine for an unknown browser", () => {
    expect(requirement(anchor, browser(null, null))).toBe("Works in Chrome 129, Firefox 147");
  });
});

describe("fixed_by_update", () => {
  const missing = (id: string): CompatResult => ({ feature: feature(id), status: Status.MISSING });

  it("is true only when a newer version of this browser has it", () => {
    expect(fixed_by_update(missing("a"), browser(Engine.CHROMIUM, "125"))).toBe(true);
    expect(fixed_by_update(missing("a"), browser(Engine.CHROMIUM, "155", "Chrome", "Windows"))).toBe(false);
    expect(fixed_by_update(missing("a"), browser(Engine.WEBKIT, "26", "Safari"))).toBe(false);
    expect(fixed_by_update({ feature: feature("a"), status: Status.OUTDATED }, browser(Engine.CHROMIUM, "125"))).toBe(true);
    expect(fixed_by_update(missing("a"), browser(null, null))).toBe(true);
  });
});
