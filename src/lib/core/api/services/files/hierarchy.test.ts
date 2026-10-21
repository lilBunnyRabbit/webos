import { describe, expect, test } from "vitest";
import { is_locked_path, is_read_only_path, is_system_path, mount_point_of } from "./hierarchy";

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
    expect(is_locked_path("/home/Templates")).toBe(true);
    expect(is_locked_path("/home/Documents/notes.txt")).toBe(false);
    expect(is_locked_path("/home/Photos")).toBe(false);
  });

  test("/mnt and its mount points, not what's inside a mount", () => {
    expect(is_locked_path("/mnt")).toBe(true);
    expect(is_locked_path("/mnt/Photos")).toBe(true);
    expect(is_locked_path("/mnt/Photos/a.png")).toBe(false);
  });
});

describe("mounts", () => {
  test("mount_point_of finds the mount a path is in", () => {
    expect(mount_point_of("/mnt/Photos/2024/a.png")).toBe("/mnt/Photos");
    expect(mount_point_of("/mnt/Photos")).toBe("/mnt/Photos");
    expect(mount_point_of("/mnt")).toBe(null);
    expect(mount_point_of("/home/mnt/x")).toBe(null);
  });

  test("/mnt itself is read-only, a mount isn't", () => {
    expect(is_read_only_path("/mnt")).toBe(true);
    expect(is_read_only_path("/mnt/Photos")).toBe(false);
    expect(is_read_only_path("/tmp/device")).toBe(true);
  });
});
