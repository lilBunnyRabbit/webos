import { describe, expect, test } from "vitest";
import { blank_answers, EXAMPLE, FieldKind, parse_form, questions, UNTITLED, new_form_id, with_form_id } from "./form";

describe("parse_form", () => {
  test("first h1 is the title, the rest becomes questions and notes in order", () => {
    const form = parse_form("# Lunch\n\nPick one.\n\n- [ ] Pizza | with olives\n- [_] Drink | water?\n- [...] Anything else\n# Later\ntext");
    expect(form.title).toBe("Lunch");
    expect(form.fields).toEqual([
      { kind: FieldKind.NOTE, content: "Pick one." },
      { kind: FieldKind.CHECK, key: "Pizza", label: "Pizza", note: "with olives" },
      { kind: FieldKind.INPUT, key: "Drink", label: "Drink", placeholder: "water?" },
      { kind: FieldKind.AREA, key: "Anything else", label: "Anything else", placeholder: null },
      { kind: FieldKind.NOTE, content: "# Later\ntext" },
    ]);
  });

  test("formlink's variants: [x], [], *, indents, any run of underscores, CRLF", () => {
    const form = parse_form("* [x] A\r\n  - [] B\r\n- [___] C\r\n- [X] D");
    expect(form.fields.map((field) => field.kind)).toEqual([FieldKind.CHECK, FieldKind.CHECK, FieldKind.INPUT, FieldKind.CHECK]);
    expect(form.title).toBe(UNTITLED);
  });

  test("a pipe needs spaces around it, and an empty meta is none", () => {
    const [a, b] = questions(parse_form("- [ ] a|b\n- [_] c | "));
    expect(a).toMatchObject({ label: "a|b", note: null });
    expect(b).toMatchObject({ label: "c", placeholder: null });
  });

  test("repeated labels get numbered keys", () => {
    expect(questions(parse_form("- [ ] Yes\n- [ ] Yes\n- [_] \n- [_] ")).map((field) => field.key)).toEqual(["Yes", "Yes (2)", "Question", "Question (2)"]);
  });

  test("lines that only look like tasks stay markdown", () => {
    expect(parse_form("- [?] maybe\n-[ ] tight\n- [ ]").fields).toEqual([{ kind: FieldKind.NOTE, content: "- [?] maybe\n-[ ] tight\n- [ ]" }]);
  });

  test("the example parses into a usable form", () => {
    const form = parse_form(EXAMPLE);
    expect(questions(form)).toHaveLength(6);
    expect(blank_answers(form)).toMatchObject({ "Darker sticky header": false, "Anything else you'd change first?": "" });
  });
});

describe("form id", () => {
  test("the id line is read and never shows as a note", () => {
    const form = parse_form("<!-- form: k3x9q2 -->\n# Survey\n- [ ] Yes");
    expect(form.id).toBe("k3x9q2");
    expect(form.fields).toEqual([{ kind: "check", key: "Yes", label: "Yes", note: null }]);
    expect(parse_form("# Survey").id).toBeNull();
  });

  test("with_form_id stamps once", () => {
    const stamped = with_form_id("# Survey", "abc123");
    expect(stamped).toBe("<!-- form: abc123 -->\n# Survey");
    expect(with_form_id(stamped, "other")).toBe(stamped);
    expect(new_form_id()).toMatch(/^[0-9a-z]{6}$/);
  });
});
