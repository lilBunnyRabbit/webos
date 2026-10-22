import { describe, expect, test } from "vitest";
import { named_files, offline_lists, type BundleFile } from "./vite-plugin-offline";

const file = (name: string, imports: string[] = [], refs: string[] = []): BundleFile => ({ name, imports, refs });

const bundle = [
  file("index.html", [], ["assets/index-a.js", "assets/index-a.css"]),
  file("assets/index-a.js", ["assets/core-b.js", "assets/settings.app-c.js", "assets/paint.app-d.js", "assets/paint-commands-e.js"]),
  file("assets/index-a.css", [], ["assets/Inter-f.woff2"]),
  file("assets/Inter-f.woff2"),
  file("assets/core-b.js", ["assets/dialog-g.js"]),
  file("assets/dialog-g.js"),
  file("assets/settings.app-c.js", ["assets/core-b.js", "assets/kit-h.js"]),
  file("assets/kit-h.js"),
  file("assets/paint.app-d.js", ["assets/core-b.js", "assets/kit-h.js", "assets/brush-i.js"], ["assets/paint.app-d.css", "assets/worker-j.js"]),
  file("assets/paint.app-d.css"),
  file("assets/brush-i.js", [], ["assets/codec-k.wasm"]),
  file("assets/codec-k.wasm"),
  file("assets/worker-j.js", [], ["assets/worker-chunk-l.js"]),
  file("assets/worker-chunk-l.js"),
  file("assets/paint-commands-e.js", ["assets/core-b.js"]),
];
const roots = new Map([["paint", new Set(["assets/paint.app-d.js", "assets/paint-commands-e.js"])]]);

describe("offline_lists", () => {
  const lists = offline_lists(bundle, ["index.html"], roots);

  test("core is what boot reaches without entering a user app, system apps included", () => {
    expect(lists.core).toEqual([
      "assets/Inter-f.woff2",
      "assets/core-b.js",
      "assets/dialog-g.js",
      "assets/index-a.css",
      "assets/index-a.js",
      "assets/kit-h.js",
      "assets/settings.app-c.js",
      "index.html",
    ]);
  });

  test("an app gets every file its lazy imports reach, workers and CSS included, minus core and runtime-cached files", () => {
    expect(lists.apps.paint).toEqual([
      "assets/brush-i.js",
      "assets/paint-commands-e.js",
      "assets/paint.app-d.css",
      "assets/paint.app-d.js",
      "assets/worker-chunk-l.js",
      "assets/worker-j.js",
    ]);
  });

  test("a user app's icon, named by the boot chunk, goes in its list instead of core", () => {
    const with_icons = offline_lists(
      [...bundle.map((entry) => (entry.name === "assets/core-b.js" ? { ...entry, refs: ["assets/icon-n.svg", "assets/icon-o.svg"] } : entry)), file("assets/icon-n.svg"), file("assets/icon-o.svg")],
      ["index.html"],
      roots,
      new Map([["paint", "assets/icon-n.svg"]])
    );
    expect(with_icons.core).not.toContain("assets/icon-n.svg");
    expect(with_icons.core).toContain("assets/icon-o.svg");
    expect(with_icons.apps.paint).toContain("assets/icon-n.svg");
  });

  test("an app reached only through a core file stays out of core", () => {
    const shared = offline_lists([...bundle, file("assets/late-m.js", ["assets/paint.app-d.js"])], ["index.html", "assets/late-m.js"], roots);
    expect(shared.core).not.toContain("assets/paint.app-d.js");
  });
});

describe("named_files", () => {
  test("finds hashed file names in a source and maps them to bundle paths", () => {
    const by_base = new Map([
      ["codecs.worker-9u_mAt2Q.js", "assets/codecs.worker-9u_mAt2Q.js"],
      ["encode-DbUZJpEL.js", "assets/encode-DbUZJpEL.js"],
    ]);
    const source = `new Worker("/webos/assets/codecs.worker-9u_mAt2Q.js");import("./encode-DbUZJpEL.js");"missing-AAAAAAAA.js"`;
    expect(named_files(source, by_base).sort()).toEqual(["assets/codecs.worker-9u_mAt2Q.js", "assets/encode-DbUZJpEL.js"]);
  });
});
