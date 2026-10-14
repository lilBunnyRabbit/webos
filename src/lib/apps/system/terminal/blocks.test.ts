import { describe, expect, it } from "vitest";
import type { ValueType } from "$lib/core/api";
import { cell, saved_text, to_blocks } from "./blocks";

const file: ValueType = { columns: ["name", "size"], text: (value) => String(value.name), cell: (value, column) => (column === "size" ? `${String(value.size)} B` : String(value[column])) };
const types = (type: string) => (type === "file" ? file : undefined);

describe("to_blocks", () => {
  it("tables tagged values of one type, text for the rest", () => {
    const blocks = to_blocks(["a", "b", { $type: "file", name: "x", size: 1 }, { $type: "file", name: "y", size: 2 }, 3], types);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "table", "text"]);
    expect(blocks[0]).toEqual({ kind: "text", text: "a\nb" });
    expect(blocks[1]).toMatchObject({ type: "file", columns: ["name", "size"] });
  });

  it("a lone record stays a record, records with the same keys become a table", () => {
    expect(to_blocks([{ a: 1 }], types)[0].kind).toBe("record");
    const [table] = to_blocks([{ a: 1, b: 2 }, { a: 3, b: 4 }, { a: 5, b: 6 }], types);
    expect(table).toMatchObject({ kind: "table", type: null, columns: ["a", "b"] });
    expect(table.kind === "table" && table.rows).toHaveLength(3);
  });

  it("unknown tagged values render as records", () => {
    expect(to_blocks([{ $type: "mystery", a: 1 }], types)[0].kind).toBe("record");
  });
});

describe("cell and saved_text", () => {
  it("uses the type's cell formatter and text form", () => {
    expect(cell({ $type: "file", name: "x", size: 3 }, "size", file)).toBe("3 B");
    expect(cell({ a: { b: 1 } }, "a", undefined)).toBe('{"b":1}');
    expect(saved_text([{ $type: "file", name: "x", size: 1 }, "done"], types)).toBe("x\ndone");
  });
});
