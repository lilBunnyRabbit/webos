import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { default_mode, diff_stat, DiffMode, ignore_whitespace_diff, map_line, strip_inline_space, summarize } from "./diff";

const doc = (source: string) => Text.of(source.split("\n"));
const chunks = (a: string, b: string, whitespace = false) =>
  Chunk.build(doc(a), doc(b), whitespace ? { override: ignore_whitespace_diff } : undefined);

describe("default_mode", () => {
  it("is unified in narrow windows and split otherwise", () => {
    expect(default_mode(420)).toBe(DiffMode.UNIFIED);
    expect(default_mode(900)).toBe(DiffMode.SPLIT);
  });
});

describe("strip_inline_space", () => {
  it("drops spaces and tabs but keeps newlines, remembering where each kept character was", () => {
    const stripped = strip_inline_space("a b\n\tc");
    expect(stripped.text).toBe("ab\nc");
    expect(stripped.offsets).toEqual([0, 2, 3, 5]);
  });
});

describe("ignore_whitespace_diff", () => {
  it("finds nothing when only spaces and tabs differ", () => {
    expect(ignore_whitespace_diff("if (x) {\n  y();\n}", "if(x){\n\ty();\n}")).toEqual([]);
    expect(chunks("a  b\nc", "a b\nc", true)).toHaveLength(0);
  });

  it("still sees changed lines and blank lines", () => {
    expect(chunks("a\nb\nc", "a\nB\nc", true)).toHaveLength(1);
    expect(chunks("a\nc", "a\n\nc", true)).toHaveLength(1);
  });

  it("maps changes back to positions in the original strings", () => {
    const [change] = ignore_whitespace_diff("  foo  bar", "foo baz");
    expect("  foo  bar".slice(change.fromA, change.toA)).toBe("r");
    expect("foo baz".slice(change.fromB, change.toB)).toBe("z");
  });

  it("places an insertion at the end of the shorter text", () => {
    const [change] = ignore_whitespace_diff("ab  ", "ab c");
    expect([change.fromA, change.toA]).toEqual([4, 4]);
    expect("ab c".slice(change.fromB, change.toB)).toBe("c");
  });
});

describe("summarize", () => {
  it("counts chunks and the lines each side has in them", () => {
    const a = "one\ntwo\nthree\nfour";
    const b = "one\nTWO\nthree\nnew\nnewer\nfour";
    expect(summarize(chunks(a, b), doc(a), doc(b))).toEqual({ changes: 2, added: 3, removed: 1 });
  });

  it("is empty for identical text", () => {
    expect(summarize(chunks("x\ny", "x\ny"), doc("x\ny"), doc("x\ny"))).toEqual({ changes: 0, added: 0, removed: 0 });
  });
});

describe("diff_stat", () => {
  it("summarizes two texts without an editor, CRLF or not", () => {
    expect(diff_stat("one\r\ntwo\r\nthree\r\nfour", "one\nTWO\nthree\nnew\nnewer\nfour")).toEqual({ changes: 2, added: 3, removed: 1 });
    expect(diff_stat("same", "same")).toEqual({ changes: 0, added: 0, removed: 0 });
  });
});

describe("map_line", () => {
  const a = ["1", "2", "3", "4", "5", "6"].join("\n");
  const b = ["1", "new", "new", "2", "3", "4", "6"].join("\n");

  it("shifts by the lines each chunk before it adds or removes", () => {
    const found = chunks(a, b);
    expect(map_line(found, 1, "a", doc(a), doc(b))).toBe(1);
    expect(map_line(found, 3, "a", doc(a), doc(b))).toBe(5);
    expect(map_line(found, 5, "b", doc(a), doc(b))).toBe(3);
    expect(map_line(found, 6, "a", doc(a), doc(b))).toBe(7);
  });

  it("counts lines, not characters, when whitespace is ignored", () => {
    const left = "x\n        indented\ny\nz";
    const right = "X\nindented\ny\nz";
    const found = chunks(left, right, true);
    expect(map_line(found, 3, "a", doc(left), doc(right))).toBe(3);
    expect(map_line(found, 4, "b", doc(left), doc(right))).toBe(4);
  });
});
