import { describe, expect, it } from "vitest";
import { bind } from "$lib/core/api/services/shell/parse";
import { tokenize } from "$lib/core/api/services/shell/tokenize";
import type { Command } from "$lib/core/api/services/shell/type";
import commands from "./commands";
import { DEFAULT_SETTINGS, SettingsSchema } from "./settings";

const trim = commands.commands.find((command) => command.id === "video trim") as Command;

describe("settings", () => {
  it("reads a version 1 file as WebM at the original size, keeping the sensitivity", () => {
    expect(SettingsSchema.parse({ version: 1, skip_sensitivity: 70 })).toEqual({ ...DEFAULT_SETTINGS, skip_sensitivity: 70 });
  });

  it("reads a version 2 file with the default max size", () => {
    const saved = { version: 2, skip_sensitivity: 50, format: "mp4", size: "720" };
    expect(SettingsSchema.parse(saved)).toEqual({ ...saved, version: 3, max_mb: 20 });
  });

  it("keeps a version 3 file and rejects an unknown format or a size of zero", () => {
    const saved = { version: 3, skip_sensitivity: 50, format: "mp4", size: "720", max_mb: 8 };
    expect(SettingsSchema.parse(saved)).toEqual(saved);
    expect(SettingsSchema.safeParse({ ...saved, format: "mov" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...saved, max_mb: 0 }).success).toBe(false);
  });
});

describe("video trim args", () => {
  it("defaults to WebM at the original size", () => {
    expect(bind(trim, tokenize("clip.webm"))).toMatchObject({ format: "webm", size: "original" });
  });

  it("takes --format and --size, sizes as text", () => {
    expect(bind(trim, tokenize("clip.webm --format mp4 --size 720"))).toMatchObject({ format: "mp4", size: "720" });
    expect(() => bind(trim, tokenize("clip.webm --size 360"))).toThrow();
  });

  it("takes -m as --max-size", () => {
    expect(bind(trim, tokenize("clip.webm -m 8mb"))).toMatchObject({ max_size: "8mb" });
  });
});
