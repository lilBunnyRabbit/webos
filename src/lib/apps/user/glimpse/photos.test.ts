import { describe, expect, test } from "vitest";
import { device_angle, photo_turn } from "./orientation";
import { expired, IndexSchema, orphans, time_left, without_photo, type Batch } from "./photos";

const batch = (id: string, expires: number, photos: string[]): Batch => ({
  id,
  created: 0,
  expires,
  photos: photos.map((photo) => ({ id: photo, taken: 0, width: 4, height: 3 })),
});

describe("index", () => {
  test("parses version 1 and refuses other versions", () => {
    const index = { version: 1, batches: [batch("b", 10, ["p1"])] };
    expect(IndexSchema.safeParse(index).success).toBe(true);
    expect(IndexSchema.safeParse({ ...index, version: 2 }).success).toBe(false);
    expect(IndexSchema.safeParse({ batches: [] }).success).toBe(false);
  });
});

describe("erasing", () => {
  test("picks batches at or past their time", () => {
    const batches = [batch("old", 100, ["a"]), batch("now", 200, ["b"]), batch("later", 300, ["c"])];
    expect(expired(batches, 200).map((entry) => entry.id)).toEqual(["old", "now"]);
  });

  test("orphans are files no photo owns, minus the ones being written", () => {
    const batches = [batch("b", 0, ["a", "b"])];
    expect(orphans(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "notes.txt"], batches, new Set(["d.jpg"]))).toEqual(["c.jpg", "notes.txt"]);
  });

  test("removing a batch's last photo removes the batch", () => {
    const batches = [batch("one", 0, ["a"]), batch("two", 0, ["b", "c"])];
    expect(without_photo(batches, "a").map((entry) => entry.id)).toEqual(["two"]);
    expect(without_photo(batches, "b")[1].photos.map((photo) => photo.id)).toEqual(["c"]);
  });

  test("time left never rounds up", () => {
    const hour = 3_600_000;
    expect(time_left(5.9 * hour, 0)).toBe("5 h");
    expect(time_left(30_000, 0)).toBe("under a minute");
    expect(time_left(3.5 * 24 * hour, 0)).toBe("3 d");
  });
});

describe("orientation", () => {
  test("gravity snaps to the nearest quarter, flat says nothing", () => {
    expect(device_angle(0, 9.8)).toBe(0);
    expect(device_angle(9.8, 1)).toBe(90);
    expect(device_angle(-1, -9.8)).toBe(180);
    expect(device_angle(-9.8, 0)).toBe(270);
    expect(device_angle(0.5, 0.5)).toBeNull();
  });

  test("turns a frame only by how far the device is past the screen", () => {
    expect(photo_turn(0, 0)).toBe(0);
    expect(photo_turn(90, 90)).toBe(0);
    expect(photo_turn(90, 0)).toBe(3);
    expect(photo_turn(270, 0)).toBe(1);
  });
});
