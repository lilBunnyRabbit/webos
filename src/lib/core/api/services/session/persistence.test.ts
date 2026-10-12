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

const frames = { settings: { x: 40, y: 50, width: 700, height: 500 } };
const empty = { windows: [], frames: {} };

describe("session file", () => {
  test("round-trips windows, including per-window state, and frames", () => {
    expect(parse_session(serialize_session({ windows: [snapshot], frames }))).toEqual({ windows: [snapshot], frames });
  });

  test("state is optional (files written before storage.window)", () => {
    const { state: _, ...without } = snapshot;
    expect(parse_session(serialize_session({ windows: [without], frames: {} })).windows).toEqual([without]);
  });

  test("a v1 file loads with no frames", () => {
    expect(parse_session(JSON.stringify({ version: 1, windows: [snapshot] }))).toEqual({ windows: [snapshot], frames: {} });
  });

  test("corrupt file or unknown version means no session", () => {
    expect(parse_session("not json")).toEqual(empty);
    expect(parse_session(JSON.stringify({ version: 3, windows: [snapshot], frames }))).toEqual(empty);
  });

  test("one invalid window rejects the whole file", () => {
    const bad = { ...snapshot, bounds: { ...snapshot.bounds, width: 0 } };
    expect(parse_session(JSON.stringify({ version: 2, windows: [snapshot, bad], frames }))).toEqual(empty);
  });

  test("snap zones survive", () => {
    const snapped = { ...snapshot, snap_zone: Object.values(SnapZone)[0] };
    expect(parse_session(serialize_session({ windows: [snapped], frames: {} })).windows[0].snap_zone).toBe(snapped.snap_zone);
  });
});
