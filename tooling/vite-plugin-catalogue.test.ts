import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  app_dirs,
  app_version,
  collect_apps,
  component_import,
  fetch_previous,
  hash_files,
  icon_sprite,
  icon_symbol,
  json_safe,
  manifest_data,
  parse_catalogue,
  release_notes,
  with_core_meta,
  type Catalogue,
  previous_or_warn,
} from "./vite-plugin-catalogue";
import type { Release } from "../src/lib/core/api/services/version/changelog-types";

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
  test("two builds of the same code hash the same despite the imported chunks' new names", () => {
    const file = (hash: string) => () => Buffer.from(`import"./main-${hash}.js";`);
    expect(hash_files(["assets/x.app-AAAAAAAA.js"], file("AAAAAAAA"))).toBe(hash_files(["assets/x.app-BBBBBBBB.js"], file("BBBBBBBB")));
  });

  test("text that mentions a release hashes as written, whatever the release being built", () => {
    const read = (text: string) => () => Buffer.from(text);
    expect(hash_files(["roadmap.js"], read("Done in 3.74.0"))).not.toBe(hash_files(["roadmap.js"], read("Done in \0stamp0\0")));
  });

  test("a changed file changes the hash; order doesn't", () => {
    const files: Record<string, string> = { "a.js": "1", "b.js": "2" };
    const read = (name: string) => Buffer.from(files[name]);
    const before = hash_files(["a.js", "b.js"], read);
    expect(hash_files(["b.js", "a.js"], read)).toBe(before);
    files["b.js"] = "3";
    expect(hash_files(["a.js", "b.js"], read)).not.toBe(before);
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
  const entry = (version: string): Release => ({
    version,
    date: "2026-10-26",
    title: version,
    introduces: ["x"],
    changes: [{ kind: "new", text: version, apps: ["x"] }],
  });
  const changelog = [entry("3.10.0"), entry("3.9.1"), entry("3.9.0"), entry("3.8.0")];

  test("the top release only, without a previous catalogue", () => {
    expect(release_notes(changelog, null).map((note) => note.version)).toEqual(["3.10.0"]);
  });

  test("every release newer than the deployed one, by number not by text", () => {
    expect(release_notes(changelog, "3.9.0").map((note) => note.version)).toEqual(["3.10.0", "3.9.1"]);
  });

  test("notes carry kind, text and the apps a line is about, nothing else", () => {
    expect(release_notes(changelog, null)[0]).toEqual({ version: "3.10.0", date: "2026-10-26", title: "3.10.0", changes: [{ kind: "new", text: "3.10.0", apps: ["x"] }] });
  });

  test("the core hash goes into index.html's head", () => {
    expect(with_core_meta("<html><head><title>x</title></head></html>", "abc")).toContain('<head>\n    <meta name="webos-core" content="abc" />');
  });
});

test("parse_catalogue rejects anything but version 1", () => {
  expect(parse_catalogue({ version: 2, release: "1.0.0", apps: [] })).toBeNull();
  expect(parse_catalogue(null)).toBeNull();
  expect(parse_catalogue({ version: 1, core: "c", release: "1.0.0", apps: [] })).not.toBeNull();
});

test("fetch_previous never throws, and says why when an asked-for catalogue didn't come", async () => {
  expect(await fetch_previous("")).toEqual({ catalogue: null, problem: null });
  const failed = await fetch_previous("http://127.0.0.1:9/store/catalogue.json");
  expect(failed.catalogue).toBeNull();
  expect(failed.problem).toBeTruthy();
});

describe("previous_or_warn", () => {
  const url = "https://example.test/store/catalogue.json";

  test("a skipped or fetched catalogue passes through quietly", () => {
    const catalogue: Catalogue = { version: 1, core: "c", build: 1, release: "1.0.0", apps: [] };
    expect(previous_or_warn({ catalogue, problem: null }, url, "1.1.0", true)).toBe(catalogue);
    expect(previous_or_warn({ catalogue: null, problem: null }, url, "1.1.0", true)).toBeNull();
  });

  test("a failed fetch warns and goes on, or throws when required", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(previous_or_warn({ catalogue: null, problem: "HTTP 404" }, url, "1.1.0", false)).toBeNull();
    expect(warn.mock.calls[0][0]).toContain("every app gets 1.1.0 as its version");
    warn.mockRestore();
    expect(() => previous_or_warn({ catalogue: null, problem: "HTTP 404" }, url, "1.1.0", true)).toThrow("HTTP 404");
  });
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

    for (const app of apps) {
      expect(app.index).toMatch(new RegExp(`^src/lib/apps/(system|user)/${app.data.id}/index\\.ts$`));
      expect(app.component).toMatch(/^src\/lib\/apps\/.+\.svelte$/);
    }
  });
});
