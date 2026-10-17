import { describe, expect, it } from "vitest";
import { canonical_codes, code_lengths } from "./huffman";
import { code_tree, tree_layout } from "./huffman-tree";

const codes = canonical_codes(code_lengths(new Map(Array.from({ length: 40 }, (_, id) => [id, 1 + id * id]))));

describe("code_tree", () => {
  it("rejects a code that isn't prefix-free", () => {
    expect(() =>
      code_tree(
        new Map([
          [1, "0"],
          [2, "01"],
        ])
      )
    ).toThrow();
  });
});

describe("tree_layout", () => {
  it("shows a small tree whole", () => {
    const small = canonical_codes(
      code_lengths(
        new Map([
          [1, 5],
          [2, 3],
          [3, 1],
          [4, 1],
        ])
      )
    );
    const layout = tree_layout(small);
    expect(layout.nodes.filter((node) => node.kind === "leaf")).toHaveLength(4);
    expect(layout.nodes.some((node) => node.kind === "group")).toBe(false);
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    expect(layout.columns).toBe(4);
  });

  it("folds a big tree into groups that keep every symbol", () => {
    const layout = tree_layout(codes, { budget: 8 });
    const bottom = layout.nodes.filter((node) => node.kind !== "branch");
    expect(bottom.length).toBeLessThanOrEqual(8);
    expect(bottom.some((node) => node.kind === "group")).toBe(true);
    expect(bottom.flatMap((node) => node.ids).sort((a, b) => a - b)).toEqual([...codes.keys()].sort((a, b) => a - b));
  });

  it("opens the path to the focused symbol", () => {
    const deepest = [...codes.values()].sort((a, b) => b.length - a.length)[0];
    expect(tree_layout(codes, { budget: 4 }).nodes.some((node) => node.code === deepest)).toBe(false);
    expect(tree_layout(codes, { budget: 4, focus: deepest }).nodes.find((node) => node.code === deepest)?.kind).toBe("leaf");
  });
});
