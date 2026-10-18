import { describe, expect, test } from "vitest";

const SOURCES = import.meta.glob<string>("./**/*.{ts,js,svelte}", { query: "?raw", import: "default", eager: true });

/** The old stable paths re-export the kit until 3.0, and the app API test pins both (ADR-048). Nothing else. */
const ALLOWED = [
  "./app-api.test.ts",
  "./games/daily.ts",
  "./games/direction.ts",
  "./games/index.ts",
  "./games/time.ts",
  "./utils/image.ts",
];

const KIT_IMPORT = new RegExp(String.raw`["'](\$kit|\$lib/kit|(\.\./)+kit)(/|["'])`);

describe("core and the app kit", () => {
  test("core never imports $kit", () => {
    const importing = Object.entries(SOURCES)
      .filter(([, source]) => KIT_IMPORT.test(source))
      .map(([file]) => file)
      .sort();
    expect(importing, "core must build without src/lib/kit; only the 3.0 shims may re-export it").toEqual(ALLOWED);
  });
});
