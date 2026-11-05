import { describe, expect, test } from "vitest";
import { DriveSettings } from "./settings.svelte";

describe("drive settings", () => {
  test("hitboxes are off in a fresh window", () => {
    expect(new DriveSettings({ value: {} }).hitboxes).toBe(false);
  });

  test("settings saved before hitboxes existed load, with hitboxes off", () => {
    const settings = new DriveSettings({ value: { sound: false, guides: false, creep: true, wheel: "stays" } });
    expect(settings.sound).toBe(false);
    expect(settings.guides).toBe(false);
    expect(settings.creep).toBe(true);
    expect(settings.wheel).toBe("stays");
    expect(settings.hitboxes).toBe(false);
  });

  test("the switch is saved and read back", () => {
    const saved = { value: {} };
    new DriveSettings(saved).toggle("hitboxes", true);
    expect(saved.value).toEqual({ hitboxes: true });
    expect(new DriveSettings(saved).hitboxes).toBe(true);
  });

  test("a bad value falls back to its default alone", () => {
    const settings = new DriveSettings({ value: { hitboxes: "yes", sound: false } });
    expect(settings.hitboxes).toBe(false);
    expect(settings.sound).toBe(false);
  });
});
