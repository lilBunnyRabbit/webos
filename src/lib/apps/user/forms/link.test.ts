import { describe, expect, test } from "vitest";
import { parse_hash } from "$lib/core/api/services/router/route";
import { EXAMPLE, parse_form } from "./form";
import { answer_code, answer_payload, app_link, form_payload, pack, read_answer_code, read_answer_payload, read_form_payload, unpack } from "./link";
import { locate } from "./match";
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

describe("answer codes", () => {
  const response = { respondent: "Ana", submitted_at: 5, answers: { Yes: true, Why: "because" } };

  test("a form with an id gets a short code without the form", async () => {
    const source = "<!-- form: abc123 -->\n# Q\n- [ ] Yes\n- [_] Why";
    const code = await answer_code({ source, name: "Survey" }, parse_form(source), response);
    expect(await unpack(code)).toEqual({ i: "abc123", n: "Survey", r: "Ana", t: 5, a: response.answers });
    expect(await read_answer_code(`  ${code}\n`)).toEqual({ id: "abc123", name: "Survey", source: null, response });
  });

  test("an old answer link still reads, form and all", async () => {
    const source = "# Q\n- [ ] Yes\n- [_] Why";
    const payload = await answer_payload({ source, name: "Survey" }, parse_form(source), response);
    const pasted = await read_answer_code(app_link({ a: payload }, "https://x.test/webos/"));
    expect(pasted).toEqual({ id: null, name: "Survey", source, response });
  });

  test("anything else is not a code", async () => {
    expect(await read_answer_code("hello")).toBeNull();
    expect(await read_answer_code(await form_payload({ source: "# a", name: null }))).toBeNull();
  });

  test("locate by id, else by file name", () => {
    const forms = [
      { path: "/home/Documents/Survey.form.md", id: null, title: "Survey", modified: 2 },
      { path: "/home/Old/Renamed.form.md", id: "abc123", title: "Q", modified: 1 },
    ];
    expect(locate(forms, { id: "abc123", name: "Survey" })?.path).toBe("/home/Old/Renamed.form.md");
    expect(locate(forms, { id: "missing", name: "survey" })?.path).toBe("/home/Documents/Survey.form.md");
    expect(locate(forms, { id: null, name: null })).toBeNull();
  });
});
