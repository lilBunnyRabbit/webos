import { describe, expect, test } from "vitest";
import { Language, language_for } from "./language";

describe("language_for", () => {
  test("picks by extension, case-insensitive", () => {
    expect(language_for("app.ts")).toBe(Language.TYPESCRIPT);
    expect(language_for("README.MD")).toBe(Language.MARKDOWN);
    expect(language_for("config.yml")).toBe(Language.YAML);
  });

  test("plain text for formats without a package", () => {
    expect(language_for("App.svelte")).toBeNull();
    expect(language_for(".env")).toBeNull();
    expect(language_for("notes")).toBeNull();
  });
});
