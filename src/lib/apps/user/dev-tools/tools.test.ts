import { describe, expect, test } from "vitest";
import { DevToolsState, MAX_STORED_TEXT, initial_state, to_stored } from "./tools";

describe("DevToolsState", () => {
  test("fills every field from nothing", () => {
    expect(initial_state().tool).toBe("base64");
    expect(initial_state().regex.flags).toBe("g");
  });

  test("a bad field falls back alone", () => {
    const state = DevToolsState.parse({ tool: "nope", json: { input: "[1]", indent: 7 }, uuid: { count: -3 } });
    expect(state.tool).toBe("base64");
    expect(state.json).toEqual({ input: "[1]", indent: "2" });
    expect(state.uuid.count).toBe(1);
  });
});

describe("to_stored", () => {
  test("drops texts over the cap and keeps the rest", () => {
    const state = initial_state();
    state.json.input = "x".repeat(MAX_STORED_TEXT + 1);
    state.regex.text = "short";
    const stored = to_stored(state);
    expect(stored.json.input).toBe("");
    expect(stored.regex.text).toBe("short");
    expect(state.json.input).toHaveLength(MAX_STORED_TEXT + 1);
  });
});
