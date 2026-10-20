import { describe, expect, test } from "vitest";
import { clip_source, safe_href, system_prompt } from "./ask";

describe("clip_source", () => {
  test("keeps short text whole and cuts long text at the limit", () => {
    expect(clip_source("a.txt", "hello", 10)).toEqual({ name: "a.txt", text: "hello", clipped: false });
    expect(clip_source("a.txt", "hello world", 5)).toEqual({ name: "a.txt", text: "hello", clipped: true });
  });
});

describe("system_prompt", () => {
  test("holds the file between markers, and says when it's only the start", () => {
    const whole = system_prompt(clip_source("notes.md", "Line one", 100));
    expect(whole).toContain('"notes.md"');
    expect(whole).toContain("--- file start ---\nLine one\n--- file end ---");
    expect(whole).not.toContain("Only the start");
    expect(system_prompt(clip_source("notes.md", "Line one", 4))).toContain("Only the start of the file is shown.");
  });

  test("without a file it's a plain assistant", () => {
    expect(system_prompt(null)).not.toContain("file");
  });
});

describe("safe_href", () => {
  test("keeps web and mail links, drops script and relative ones", () => {
    expect(safe_href("https://example.com/a")).toBe("https://example.com/a");
    expect(safe_href("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safe_href("javascript:alert(1)")).toBeNull();
    expect(safe_href("/etc/settings.json")).toBeNull();
  });
});
