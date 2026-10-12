import { describe, expect, test } from "vitest";
import { parse_message, part_name, resume_offset, safe_name } from "./protocol";

describe("safe_name", () => {
  test("replaces path separators and control characters", () => {
    expect(safe_name("../etc/settings.json")).toBe(".._etc_settings.json");
    expect(safe_name("a\\b\u0000c")).toBe("a_b_c");
  });

  test("never returns a name OPFS rejects", () => {
    expect(safe_name("")).toBe("file");
    expect(safe_name(" .. ")).toBe("file");
  });
});

describe("parse_message", () => {
  test("cleans file names in a manifest", () => {
    const message = parse_message(JSON.stringify({ type: "manifest", files: [{ name: "a/b.txt", size: 3, type: "" }] }));
    expect(message).toEqual({ type: "manifest", files: [{ name: "a_b.txt", size: 3, type: "" }] });
  });

  test("rejects unknown and malformed messages", () => {
    expect(() => parse_message(JSON.stringify({ type: "delete" }))).toThrow();
    expect(() => parse_message(JSON.stringify({ type: "start", index: -1, offset: 0 }))).toThrow();
    expect(() => parse_message("not json")).toThrow();
  });
});

describe("resume", () => {
  test("part names differ by size", () => {
    expect(part_name({ name: "a.mp4", size: 10, type: "" })).not.toBe(part_name({ name: "a.mp4", size: 11, type: "" }));
  });

  test("continues from the held bytes, restarts when they can't fit", () => {
    expect(resume_offset({ name: "a", size: 100, type: "" }, 40)).toBe(40);
    expect(resume_offset({ name: "a", size: 100, type: "" }, 100)).toBe(100);
    expect(resume_offset({ name: "a", size: 100, type: "" }, 140)).toBe(0);
  });
});
