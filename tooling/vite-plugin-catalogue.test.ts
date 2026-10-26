import path from "node:path";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  app_dirs,
  app_version,
  collect_apps,
  component_import,
  dev_catalogue,
  fetch_previous,
  hash_files,
  icon_sprite,
  icon_symbol,
  json_safe,
  manifest_data,
  parse_catalogue,
  release_notes,
  content_normalizer,
  type Catalogue,
  type ReleaseNote,
} from "./vite-plugin-catalogue";
import type { VersionInfo } from "./vite-plugin-version";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("icon_symbol", () => {
  const html =
    '<!--[--><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="none"><g stroke="currentColor"><path d="M1 1h2"></path></g><rect fill="var(--primary)"></rect></svg><!--]-->';

  test("keeps the viewBox, drops sizing and moves presentation attributes to a group", () => {
    expect(icon_symbol("snake", html)).toBe(
      '<symbol id="snake" viewBox="0 0 24 24"><g fill="none"><g stroke="currentColor"><path d="M1 1h2"></path></g><rect fill="var(--primary)"></rect></g></symbol>'
    );
  });

  test("an svg with only sizing attributes needs no group", () => {
    expect(icon_symbol("a", '<svg viewBox="0 0 16 16" width="1em"><path d="M0 0"/></svg>')).toBe('<symbol id="a" viewBox="0 0 16 16"><path d="M0 0"/></symbol>');
  });

  test("an icon without an svg or a viewBox fails the build", () => {
    expect(() => icon_symbol("a", "<div></div>")).toThrow(/no <svg>/);
    expect(() => icon_symbol("a", "<svg><path/></svg>")).toThrow(/no viewBox/);
  });
});

describe("manifest_data", () => {
  const manifest = {
    id: "sudoku",
    name: "Sudoku",
    category: "games",
    icon: () => null,
    version: "1.0.0",
    props: z.object({ daily: z.string().optional() }),
    defaults: { flags: new Set(["maximized"]), constraints: { width: { min: 300 } } },
    associations: [".sudoku"],
    widget: () => Promise.resolve(),
    shell: () => Promise.resolve(),
    component: () => Promise.resolve(),
  };

  test("keeps data, turns lazy parts into flags and a daily props key into `daily`", () => {
    const data = manifest_data(manifest, { description: "Numbers.", keywords: ["puzzle"] }, false);
    expect(data).toEqual({
      id: "sudoku",
      name: "Sudoku",
      category: "games",
      system: false,
      associations: [".sudoku"],
      description: "Numbers.",
      keywords: ["puzzle"],
      defaults: { flags: ["maximized"], constraints: { width: { min: 300 } } },
      daily: true,
      widget: true,
      shell: true,
    });
  });

  test("an app without props or extras has no flags", () => {
    const data = manifest_data({ id: "a", name: "A", category: "media", icon: null }, {}, true);
    expect(data).toEqual({ id: "a", name: "A", category: "media", system: true });
  });
});

test("json_safe drops functions and spreads iterables", () => {
  expect(json_safe({ a: () => 1, b: new Set([1, 2]), c: [{ d: undefined, e: null }] })).toEqual({ b: [1, 2], c: [{ e: null }] });
});

test("component_import reads the lazy component path", () => {
  expect(component_import('  component: () => import("./snake.app.svelte"),')).toBe("./snake.app.svelte");
  expect(component_import("component: Snake")).toBeNull();
});

describe("hashes", () => {
  const info = (commit: string, stamp: number): VersionInfo => ({
    version: "3.73.0",
    commit,
    branch: "master",
    buildTime: new Date(stamp).toISOString(),
    buildTimestamp: stamp,
  });
  const file = (version: VersionInfo) => Buffer.from(`import"./main-${version.commit}X.js";const v=${JSON.stringify(version)};`);

  test("two builds of the same code hash the same despite the build stamp and the stamped chunk's new name", () => {
    const a = info("abc1234", 1_793_000_000_000);
    const b = info("def5678", 1_793_000_500_000);
    expect(hash_files(["assets/x.app-AAAAAAAA.js"], () => file(a), content_normalizer(a))).toBe(
      hash_files(["assets/x.app-BBBBBBBB.js"], () => file(b), content_normalizer(b))
    );
  });

  test("a changed file changes the hash; order doesn't", () => {
    const stamp = info("abc1234", 1);
    const files: Record<string, string> = { "a.js": "1", "b.js": "2" };
    const read = (name: string) => Buffer.from(files[name]);
    const before = hash_files(["a.js", "b.js"], read, content_normalizer(stamp));
    expect(hash_files(["b.js", "a.js"], read, content_normalizer(stamp))).toBe(before);
    files["b.js"] = "3";
    expect(hash_files(["a.js", "b.js"], read, content_normalizer(stamp))).not.toBe(before);
  });
});

describe("app_version", () => {
  const previous = { version: 1, core: "c", release: "3.67.0", apps: [{ id: "snake", hash: "h1", version: "3.60.0" }] } as Catalogue;

  test("an unchanged app keeps the release it last changed in", () => {
    expect(app_version("snake", "h1", previous, "3.73.0")).toBe("3.60.0");
  });

  test("a changed or new app, or no previous catalogue, takes this release", () => {
    expect(app_version("snake", "h2", previous, "3.73.0")).toBe("3.73.0");
    expect(app_version("paint", "h1", previous, "3.73.0")).toBe("3.73.0");
    expect(app_version("snake", "h1", null, "3.73.0")).toBe("3.73.0");
  });
});

describe("release_notes", () => {
  const entry = (version: string): ReleaseNote & { introduces?: string[] } => ({
    version,
    date: "2026-10-26",
    title: version,
    introduces: ["x"],
    changes: [{ kind: "new", text: version, apps: ["x"] } as ReleaseNote["changes"][number]],
  });
  const changelog = [entry("3.10.0"), entry("3.9.1"), entry("3.9.0"), entry("3.8.0")];

  test("the top release only, without a previous catalogue", () => {
    expect(release_notes(changelog, null).map((note) => note.version)).toEqual(["3.10.0"]);
  });

  test("every release newer than the deployed one, by number not by text", () => {
    expect(release_notes(changelog, "3.9.0").map((note) => note.version)).toEqual(["3.10.0", "3.9.1"]);
  });

  test("notes carry kind and text only", () => {
    expect(release_notes(changelog, null)[0]).toEqual({ version: "3.10.0", date: "2026-10-26", title: "3.10.0", changes: [{ kind: "new", text: "3.10.0" }] });
  });
});

test("parse_catalogue rejects anything but version 1", () => {
  expect(parse_catalogue({ version: 2, release: "1.0.0", apps: [] })).toBeNull();
  expect(parse_catalogue(null)).toBeNull();
  expect(parse_catalogue({ version: 1, core: "c", release: "1.0.0", apps: [] })).not.toBeNull();
});

test("fetch_previous never throws", async () => {
  expect(await fetch_previous("")).toBeNull();
  expect(await fetch_previous("http://127.0.0.1:9/store/catalogue.json")).toBeNull();
});

describe("every app", () => {
  const load = (id: string) => import(/* @vite-ignore */ id.startsWith("/") ? path.join(ROOT, id) : id);

  test("loads in Node and has a symbol in the sprite", { timeout: 120_000 }, async () => {
    const apps = await collect_apps(ROOT, load);
    const ids = app_dirs(ROOT).map((app) => app.id);
    expect(apps.map((app) => app.data.id)).toEqual(ids);

    const sprite = icon_sprite(apps.map((app) => app.symbol));
    const symbols = [...sprite.matchAll(/<symbol id="([^"]+)" viewBox="[^"]+">/g)].map((match) => match[1]);
    expect(symbols).toEqual(ids);
    expect(sprite).toContain("currentColor");
    expect(sprite).toContain("var(--primary)");

    const catalogue = dev_catalogue(apps, "1.0.0");
    for (const app of catalogue.apps) {
      expect(app.manifest).toMatch(new RegExp(`^src/lib/apps/(system|user)/${app.id}/index\\.ts$`));
      expect(app.entry).toMatch(/^src\/lib\/apps\/.+\.svelte$/);
    }
  });
});
