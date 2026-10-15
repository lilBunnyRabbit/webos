import { describe, expect, test } from "vitest";
import {
  area_of,
  backup_name,
  normalize_areas,
  parse_manifest,
  serialize_manifest,
  storage_bytes,
  type BackupManifest,
} from "./manifest";
import { BackupError } from "./type";

const manifest: BackupManifest = {
  format: 1,
  version: "0.37.0",
  created: "2026-10-15T09:30:00.000Z",
  areas: ["files", "apps"],
  local_storage: { "app.notes.font": '"mono"' },
};

describe("backup manifest", () => {
  test("round-trips through its JSON", () => {
    expect(parse_manifest(serialize_manifest(manifest))).toEqual(manifest);
  });

  test("rejects a newer format with an update hint before checking the rest", () => {
    expect(() => parse_manifest(JSON.stringify({ format: 2, anything: true }))).toThrow(/newer WebOS \(format 2\)/);
  });

  test("rejects files that aren't backups", () => {
    expect(() => parse_manifest("not json")).toThrow(BackupError);
    expect(() => parse_manifest(JSON.stringify({ hello: "world" }))).toThrow(/no format/);
    expect(() => parse_manifest(JSON.stringify({ ...manifest, areas: ["tmp"] }))).toThrow(/damaged/);
    expect(() => parse_manifest(JSON.stringify({ ...manifest, areas: [] }))).toThrow(/damaged/);
    expect(() => parse_manifest(JSON.stringify({ ...manifest, created: "yesterday" }))).toThrow(/damaged/);
  });

  test("only takes app storage keys", () => {
    expect(() => parse_manifest(JSON.stringify({ ...manifest, local_storage: { "kernel.x": "1" } }))).toThrow(
      /damaged/
    );
  });
});

describe("backup areas", () => {
  test("maps zip paths to areas by their folder", () => {
    expect(area_of(["home", "Documents", "a.txt"])?.area).toBe("files");
    expect(area_of(["home"])?.area).toBe("files");
    expect(area_of(["etc", "settings.json"])?.area).toBe("settings");
    expect(area_of(["var", "lib", "session", "session.json"])?.area).toBe("apps");
    expect(area_of(["var", "cache", "x"])).toBeNull();
    expect(area_of(["tmp", "x"])).toBeNull();
    expect(area_of(["backup.json"])).toBeNull();
  });

  test("normalizes a selection to known areas, once each, in a fixed order", () => {
    expect(normalize_areas(["apps", "files", "apps", "tmp"])).toEqual(["files", "apps"]);
    expect(normalize_areas([])).toEqual([]);
  });

  test("names the zip after the local day", () => {
    expect(backup_name(new Date(2026, 9, 5, 23, 59))).toBe("webos-backup-2026-10-05.zip");
  });

  test("counts storage in UTF-8 bytes", () => {
    expect(storage_bytes({ "app.a.k": "é" })).toBe(7 + 2);
  });
});
