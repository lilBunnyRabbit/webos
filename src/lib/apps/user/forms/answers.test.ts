import { describe, expect, test } from "vitest";
import { add_response, answer_columns, empty_answers, form_stem, has_response, with_extension, with_form_extension, parse_answers, remove_response, serialize_answers, stem_from_title, tally, to_csv } from "./answers";
import { parse_form } from "./form";

const source = '# Team lunch\n- [ ] Pizza\n- [_] Drink';
const ana = { respondent: "Ana", submitted_at: 2, answers: { Pizza: true, Drink: 'water, "cold"' } };
const bo = { respondent: null, submitted_at: 1, answers: { Pizza: false, Drink: "", Old: "kept" } };

describe("answers file", () => {
  test("round-trips and rejects other shapes", () => {
    const file = add_response(empty_answers(source), source, ana).file;
    expect(parse_answers(serialize_answers(file))).toEqual(file);
    expect(parse_answers("{}")).toBeNull();
    expect(parse_answers("not json")).toBeNull();
  });

  test("adding keeps time order, skips a repeat and takes the newer form", () => {
    let file = add_response(empty_answers("old"), source, ana).file;
    file = add_response(file, source, bo).file;
    expect(file.responses.map((response) => response.submitted_at)).toEqual([1, 2]);
    expect(file.form).toBe(source);
    expect(add_response(file, source, { ...ana, answers: { ...ana.answers } }).added).toBe(false);
    expect(has_response(file, bo)).toBe(true);
    expect(remove_response(file, 0).responses).toEqual([ana]);
  });
});

describe("table", () => {
  const columns = answer_columns(parse_form(source), [ana, bo]);

  test("form questions first, then keys only older answers have", () => {
    expect(columns).toEqual([
      { key: "Pizza", label: "Pizza", check: true },
      { key: "Drink", label: "Drink", check: false },
      { key: "Old", label: "Old", check: false },
    ]);
    expect(tally(columns, [ana, bo])).toEqual(new Map([["Pizza", 1]]));
  });

  test("CSV quotes what needs it", () => {
    expect(to_csv(columns, [bo, ana]).split("\r\n")).toEqual([
      "Respondent,Submitted,Pizza,Drink,Old",
      ",1970-01-01T00:00:00.001Z,,,kept",
      'Ana,1970-01-01T00:00:00.002Z,yes,"water, ""cold""",',
      "",
    ]);
  });
});

test("names", () => {
  expect(form_stem("Survey.Form.md")).toBe("Survey");
  expect(form_stem("notes.md")).toBe("notes");
  expect(stem_from_title('Design: "v2" / final')).toBe("Design v2 final");
  expect(stem_from_title("  ")).toBe("Form");
  expect(with_form_extension("/a/survey")).toBe("/a/survey.form.md");
  expect(with_form_extension("/a/survey.MD")).toBe("/a/survey.form.md");
  expect(with_form_extension("/a/s.Form.md")).toBe("/a/s.Form.md");
  expect(with_extension("/a/x.csv", ".csv")).toBe("/a/x.csv");
  expect(with_extension("/a/x", ".csv")).toBe("/a/x.csv");
});
