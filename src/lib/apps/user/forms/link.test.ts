import { describe, expect, test } from "vitest";
import { parse_hash } from "$lib/core/api/services/router/route";
import { EXAMPLE, parse_form } from "./form";
import { answer_payload, app_link, form_payload, pack, read_answer_payload, read_form_payload, unpack } from "./link";
import { FORMS_PROPS } from "./props";

describe("pack", () => {
  test("round-trips and stays URL-safe", async () => {
    const value = { s: "# Ünïcode ✓\n- [ ] a", n: "x" };
    const packed = await pack(value);
    expect(packed).toMatch(/^v1[\w-]+$/);
    expect(await unpack(packed)).toEqual(value);
  });

  test("garbage unpacks to null", async () => {
    expect(await unpack("v1notdeflate")).toBeNull();
    expect(await unpack("nope")).toBeNull();
  });
});

describe("links", () => {
  test("a form link survives the router and the props schema", async () => {
    const payload = await form_payload({ source: EXAMPLE, name: "Design" });
    const link = app_link({ f: payload }, "https://x.test/webos/");
    const route = parse_hash(link.slice(link.indexOf("#")));
    expect(route?.id).toBe("forms");
    expect(route?.kind).toBe("solo");
    const props = FORMS_PROPS.parse(route?.props);
    expect(await read_form_payload(props.f!)).toEqual({ source: EXAMPLE, name: "Design" });
  });

  test("answers travel by position and come back keyed", async () => {
    const source = "# Q\n- [ ] Yes\n- [_] Why\n- [ ] Yes";
    const form = parse_form(source);
    const payload = await answer_payload({ source, name: null }, form, {
      respondent: "Ana",
      submitted_at: 5,
      answers: { Yes: true, Why: "because", "Yes (2)": false },
    });
    expect(await read_answer_payload(payload)).toEqual({
      source,
      name: null,
      response: { respondent: "Ana", submitted_at: 5, answers: { Yes: true, Why: "because", "Yes (2)": false } },
    });
  });

  test("a form link is not an answer link", async () => {
    expect(await read_answer_payload(await form_payload({ source: "# a", name: null }))).toBeNull();
  });
});
