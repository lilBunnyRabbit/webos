import { describe, expect, test } from "vitest";
import { EMPTY_STATE, parse_state, serialize_state, with_resume } from "./persistence";

describe("background state", () => {
  test("round-trips resume entries", () => {
    const state = with_resume(EMPTY_STATE, "motion-watch", { props: { zone: 1 }, since: 5 });
    expect(parse_state(serialize_state(state))).toEqual(state);
  });

  test("missing, broken or another version is empty", () => {
    expect(parse_state(null)).toEqual(EMPTY_STATE);
    expect(parse_state("{")).toEqual(EMPTY_STATE);
    expect(parse_state(JSON.stringify({ version: 2, resume: {} }))).toEqual(EMPTY_STATE);
  });

  test("a bad entry is dropped alone", () => {
    const text = JSON.stringify({ version: 1, resume: { good: { props: {}, since: 1 }, bad: { props: 3 } } });
    expect(Object.keys(parse_state(text).resume)).toEqual(["good"]);
  });

  test("null removes an entry without touching the others", () => {
    const one = with_resume(EMPTY_STATE, "a", { props: {}, since: 1 });
    const two = with_resume(one, "b", { props: {}, since: 2 });
    expect(Object.keys(with_resume(two, "a", null).resume)).toEqual(["b"]);
    expect(one.resume.a).toBeDefined();
  });
});
