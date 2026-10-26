import { describe, expect, test } from "vitest";
import { CHANGELOG } from "./changelog";
import { app_history, introduced_apps, recency, updated_apps, with_notes } from "./history";
import { ChangeKind, type Release } from "./type";

const { NEW, IMPROVED, FIXED } = ChangeKind;

const LOG: Release[] = [
  {
    version: "0.3.0",
    date: "2026-01-03",
    title: "Third",
    changes: [
      { kind: FIXED, apps: ["paint"], text: "Paint fix" },
      { kind: NEW, apps: ["maze", "paint"], text: "Both" },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-01-02",
    title: "Second",
    introduces: ["maze"],
    changes: [{ kind: NEW, apps: ["maze"], text: "Maze" }],
  },
  {
    version: "0.1.0",
    date: "2026-01-01",
    title: "First",
    introduces: ["paint", "maze"],
    changes: [
      { kind: NEW, apps: ["paint"], text: "Paint" },
      { kind: IMPROVED, text: "Untagged" },
    ],
  },
];

describe("app_history", () => {
  test("added, updated and every tagged change, newest first", () => {
    const history = app_history(LOG, "paint");
    expect(history.added?.version).toBe("0.1.0");
    expect(history.updated?.version).toBe("0.3.0");
    expect(history.changes.map(({ release, change }) => `${release.version} ${change.text}`)).toEqual([
      "0.3.0 Paint fix",
      "0.3.0 Both",
      "0.1.0 Paint",
    ]);
  });

  test("an app only changed in the release that adds it has no update", () => {
    const history = app_history(LOG.slice(1), "maze");
    expect(history.added?.version).toBe("0.2.0");
    expect(history.updated).toBeNull();
  });

  test("the newest release that introduces an app wins, and older lines stay in its history", () => {
    const history = app_history(LOG, "maze");
    expect(history.added?.version).toBe("0.2.0");
    expect(history.updated?.version).toBe("0.3.0");
  });

  test("an app the changelog never introduces still gets its updates", () => {
    const log: Release[] = [{ version: "1.0.0", date: "2026-02-01", title: "x", changes: [{ kind: NEW, apps: ["example"], text: "Demo" }] }];
    expect(app_history(log, "example")).toMatchObject({ added: null, updated: { version: "1.0.0" } });
    expect(app_history(log, "nothing")).toEqual({ added: null, updated: null, changes: [] });
  });
});

describe("introduced_apps and updated_apps", () => {
  test("each app once, in the releases' order", () => {
    expect(introduced_apps(LOG).map(({ app, release }) => `${app}@${release.version}`)).toEqual(["maze@0.2.0", "paint@0.1.0"]);
  });

  test("updated leaves out apps the same releases introduce", () => {
    expect([...updated_apps(LOG.slice(0, 1))].sort()).toEqual(["maze", "paint"]);
    expect([...updated_apps(LOG.slice(0, 2))]).toEqual(["paint"]);
  });

  test("recency is the index of the newest mention", () => {
    expect(recency(LOG, "paint")).toBe(0);
    expect(recency(LOG.slice(1), "paint")).toBe(1);
    expect(recency(LOG, "nothing")).toBe(Infinity);
  });
});

// Empty while retired apps' lines are tagged with their successor (image-tools, text-editor).
const RETIRED: string[] = [];

describe("CHANGELOG app tags", () => {
  // Lazy glob: only the paths are needed, so no manifest is evaluated.
  const installed = Object.keys(import.meta.glob("../../../../apps/*/*/index.ts")).map((path) => path.split("/").at(-2));
  const known = new Set([...installed, ...RETIRED]);
  // The fork check deletes every user app; the changelog still names them, and announcements skip missing ones.
  const forked = !installed.some((id) => id === "example");

  test.skipIf(forked)("every tagged or introduced id is an app", () => {
    expect(installed).toContain("file-explorer");
    const ids = CHANGELOG.flatMap((release) => [...(release.introduces ?? []), ...release.changes.flatMap((change) => change.apps ?? [])]);
    expect(ids.filter((id) => !known.has(id))).toEqual([]);
  });

  test("an app is introduced once, with a line of its own in that release", () => {
    const introduced = CHANGELOG.flatMap((release) => release.introduces ?? []);
    expect(introduced.length).toBe(new Set(introduced).size);
    for (const release of CHANGELOG)
      for (const app of release.introduces ?? [])
        expect(release.changes.some((change) => change.apps?.includes(app)), `${app} in ${release.version}`).toBe(true);
  });
});

describe("with_notes (ADR-077 stage 3)", () => {
  test("releases only version.json knows join the changelog in order; known ones aren't doubled", () => {
    const notes: Release[] = [{ version: "0.3.1", date: "2026-01-04", title: "Snake", changes: [{ kind: FIXED, text: "Fixed", apps: ["snake"] }] }, LOG[0]];
    expect(with_notes(LOG, notes).map((release) => release.version)).toEqual(["0.3.1", ...LOG.map((release) => release.version)]);
    expect(with_notes(LOG, [])).toEqual(LOG);
  });
});
