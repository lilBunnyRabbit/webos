import { describe, expect, test } from "vitest";
import { is_locked_path, is_system_path } from "./hierarchy";

describe("is_system_path", () => {
  test("the system folders and everything under them", () => {
    expect(is_system_path("/etc")).toBe(true);
    expect(is_system_path("/var/lib/session/session.json")).toBe(true);
    expect(is_system_path("/tmp/x")).toBe(true);
    expect(is_system_path("/etcetera")).toBe(false);
    expect(is_system_path("/home/etc")).toBe(false);
  });
});

describe("is_locked_path", () => {
  test("system paths and the layout's own folders, not what users put in them", () => {
    expect(is_locked_path("/etc/settings.json")).toBe(true);
    expect(is_locked_path("/home")).toBe(true);
    expect(is_locked_path("/home/Desktop")).toBe(true);
    expect(is_locked_path("/home/Documents")).toBe(true);
    expect(is_locked_path("/home/Documents/notes.txt")).toBe(false);
    expect(is_locked_path("/home/Photos")).toBe(false);
  });
});
