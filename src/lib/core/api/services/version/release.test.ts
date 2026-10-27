import { expect, test } from "vitest";
import { CHANGELOG } from "./changelog";
import { parse_changelog, release_info, running_changelog } from "./release";

test("release_info reads the catalogue header", () => {
  expect(release_info(null)).toBeNull();
  expect(release_info({ version: 1, core: "c", build: 0, release: "3.74.1", commit: "abc1234", branch: "master" })).toEqual({
    version: "3.74.1",
    commit: "abc1234",
    branch: "master",
    buildTime: "1970-01-01T00:00:00.000Z",
    buildTimestamp: 0,
  });
  expect(release_info({ version: 1, core: "c", build: 0, release: "3.74.0" })?.commit).toBe("unknown");
});

test("parse_changelog takes what the build writes and rejects anything else", () => {
  expect(parse_changelog(JSON.parse(JSON.stringify(CHANGELOG)))).toEqual(CHANGELOG);
  expect(parse_changelog({ releases: [] })).toBeNull();
  expect(parse_changelog([{ version: "1.0.0" }])).toBeNull();
});

test("running_changelog stops at the running release", () => {
  const releases = ["3.75.0", "3.74.1", "3.74.0"].map((version) => ({ version, date: "", title: "", changes: [] }));
  expect(running_changelog(releases, "3.74.1").map((release) => release.version)).toEqual(["3.74.1", "3.74.0"]);
  expect(running_changelog(releases, null)).toHaveLength(3);
});
