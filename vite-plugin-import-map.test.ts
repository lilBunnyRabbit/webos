import { describe, expect, test } from "vitest";
import { module_identity } from "./vite-plugin-import-map";

describe("module_identity", () => {
  test("a source file is its path from the root", () => {
    expect(module_identity("/a/webos/src/main.ts", "/a/webos")).toBe("src/main.ts");
  });

  test("the same source in two checkouts gives the same identity", () => {
    const a = module_identity("\0/a/webos/node_modules/x/index.js?commonjs-proxy", "/a/webos");
    const b = module_identity("\0/b/tree/node_modules/x/index.js?commonjs-proxy", "/b/tree");
    expect(a).toBe("node_modules/x/index.js");
    expect(b).toBe(a);
  });

  test("a virtual module without a path keeps its name", () => {
    expect(module_identity("\0vite/preload-helper.js", "/a/webos")).toBe("vite/preload-helper.js");
    expect(module_identity("\0vite/preload-helper.js", "/b/tree")).toBe("vite/preload-helper.js");
  });

  test("a query on a file doesn't count", () => {
    expect(module_identity("/a/webos/src/app.svelte?svelte&type=style&lang.css", "/a/webos")).toBe("src/app.svelte");
  });
});
