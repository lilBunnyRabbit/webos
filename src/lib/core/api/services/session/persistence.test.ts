import { describe, expect, test } from "vitest";
import { SnapZone, WindowFlag, type WindowSnapshot } from "../windows/type";
import { parse_session, serialize_session } from "./persistence";

const snapshot: WindowSnapshot = {
  app_id: "settings",
  props: { section: "about" },
  bounds: { x: 10, y: 20, width: 600, height: 400 },
  flags: [WindowFlag.MAXIMIZED],
  snap_zone: null,
  state: { section: "whats-new" },
};

describe("session file", () => {
  test("round-trips windows, including per-window state", () => {
    expect(parse_session(serialize_session([snapshot]))).toEqual([snapshot]);
  });

  test("state is optional (files written before storage.window)", () => {
    const { state: _, ...without } = snapshot;
    expect(parse_session(serialize_session([without]))).toEqual([without]);
  });

  test("corrupt file or unknown version means no session", () => {
    expect(parse_session("not json")).toEqual([]);
    expect(parse_session(JSON.stringify({ version: 2, windows: [snapshot] }))).toEqual([]);
  });

  test("one invalid window rejects the whole file", () => {
    const bad = { ...snapshot, bounds: { ...snapshot.bounds, width: 0 } };
    expect(parse_session(JSON.stringify({ version: 1, windows: [snapshot, bad] }))).toEqual([]);
  });

  test("snap zones survive", () => {
    const snapped = { ...snapshot, snap_zone: Object.values(SnapZone)[0] };
    expect(parse_session(serialize_session([snapped]))[0].snap_zone).toBe(snapped.snap_zone);
  });
});
