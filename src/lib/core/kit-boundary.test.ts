import { describe, expect, test } from "vitest";

const SOURCES = import.meta.glob<string>("./**/*.{ts,js,svelte}", { query: "?raw", import: "default", eager: true });

/** The app API test pins the kit's stable exports (ADR-048). Nothing else. */
const ALLOWED = ["./app-api.test.ts"];

const KIT_IMPORT = new RegExp(String.raw`["'](\$kit|\$lib/kit|(\.\./)+kit)(/|["'])`);

describe("core and the app kit", () => {
  test("core never imports $kit", () => {
    const importing = Object.entries(SOURCES)
      .filter(([, source]) => KIT_IMPORT.test(source))
      .map(([file]) => file)
      .sort();
    expect(importing, "core must build without src/lib/kit; only the app API test may import it").toEqual(ALLOWED);
  });
});
