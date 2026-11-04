import { describe, expect, test } from "vitest";
import type { ZodType } from "zod";
import { DriveSettings } from "./settings.svelte";

function storage(saved: Record<string, unknown>) {
  const values = new Map(Object.entries(saved));
  return {
    values,
    get<T>(key: string, schema?: ZodType<T>): T | null {
      if (!values.has(key)) return null;
      const parsed = schema?.safeParse(values.get(key));
      return parsed ? (parsed.success ? parsed.data : null) : (values.get(key) as T);
    },
    set<T>(key: string, value: T) {
      values.set(key, value);
    },
  };
}

describe("drive settings", () => {
  test("hitboxes are off in a fresh window", () => {
    expect(new DriveSettings(storage({})).hitboxes).toBe(false);
  });

  test("settings saved before hitboxes existed load, with hitboxes off", () => {
    const settings = new DriveSettings(storage({ sound: false, guides: false, creep: true, wheel: "stays" }));
    expect(settings.sound).toBe(false);
    expect(settings.guides).toBe(false);
    expect(settings.creep).toBe(true);
    expect(settings.wheel).toBe("stays");
    expect(settings.hitboxes).toBe(false);
  });

  test("the switch is saved and read back", () => {
    const saved = storage({});
    new DriveSettings(saved).toggle("hitboxes", true);
    expect(saved.values.get("hitboxes")).toBe(true);
    expect(new DriveSettings(saved).hitboxes).toBe(true);
  });

  test("a saved value that isn't a boolean falls back to off", () => {
    expect(new DriveSettings(storage({ hitboxes: "yes" })).hitboxes).toBe(false);
  });
});
