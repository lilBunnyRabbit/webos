import { describe, expect, test } from "vitest";
import { parse_cook } from "./cooklang";
import { recipe_tree, table_layout, type TableCell, type TableNode } from "./table";

function shape(node: TableNode | { kind: "dish"; children: TableNode[] } | null): unknown {
  if (!node) return null;
  if (node.kind === "ingredient") return node.name;
  const children = node.children.map(shape);
  return node.kind === "step" ? { [`step ${node.step.number}`]: children } : { dish: children };
}

const tree_of = (source: string) => recipe_tree(parse_cook(source));

function label(cell: TableCell): string {
  const node = cell.node;
  if (node.kind === "ingredient") return node.name;
  if (node.kind === "step") return `step ${node.step.number}`;
  return "dish";
}

describe("recipe_tree", () => {
  test("a linear recipe nests every step into the next", () => {
    const tree = tree_of("Boil @water in a #pot.\n\nAdd @salt and @pasta.\n\nDrain.");
    expect(shape(tree.dish)).toEqual({ "step 3": [{ "step 2": [{ "step 1": ["water"] }, "salt", "pasta"] }] });
    expect(tree.prep).toEqual([]);
  });

  test("new ingredients in new cookware start a branch; naming one again joins it back", () => {
    const tree = tree_of(
      "Whisk @eggs and @sugar in a #bowl.\n\nMelt @butter and @chocolate in a #saucepan.\n\nFold the @chocolate into the @eggs.\n\nBake ~{20%min}."
    );
    expect(shape(tree.dish)).toEqual({
      "step 4": [{ "step 3": [{ "step 1": ["eggs", "sugar"] }, { "step 2": ["butter", "chocolate"] }] }],
    });
  });

  test("using the same cookware again takes in what's in it", () => {
    const tree = tree_of("Mix @flour in a #bowl.\n\nHeat @oil in a #pan.\n\nPour the #bowl into the #pan.");
    expect(shape(tree.dish)).toEqual({ "step 3": [{ "step 1": ["flour"] }, { "step 2": ["oil"] }] });
  });

  test("a section carries on unless its step brings new cookware; open branches meet in the dish", () => {
    const finish = tree_of("= Base\nSimmer @tomatoes in a #pot.\n\n= Finish\nBlend, season with @salt.");
    expect(shape(finish.dish)).toEqual({ "step 1": [{ "step 1": ["tomatoes"] }, "salt"] });
    const topping = tree_of("= Dough\nMix @flour and @water in a #bowl.\n\n= Topping\nChop @tomatoes on a #board.");
    expect(shape(topping.dish)).toEqual({ dish: [{ "step 1": ["flour", "water"] }, { "step 1": ["tomatoes"] }] });
  });

  test("steps with nothing to combine yet are prep notes", () => {
    const tree = tree_of("Preheat the oven to 200°C.\n\nToss @potatoes with @oil.\n\nRoast ~{40%min}.");
    expect(tree.prep.map((step) => step.number)).toEqual([1]);
    expect(shape(tree.dish)).toEqual({ "step 3": [{ "step 2": ["potatoes", "oil"] }] });
  });

  test("no ingredients, no dish", () => {
    expect(tree_of("Stir.").dish).toBeNull();
  });
});

describe("table_layout", () => {
  test("ingredients take a row each and stretch right to the step that uses them", () => {
    const tree = tree_of("Whisk @eggs and @sugar in a #bowl.\n\nMelt @butter in a #pan.\n\nFold @butter into @eggs.");
    const layout = table_layout(tree, "Mousse");
    expect(layout.rows).toBe(3);
    expect(layout.columns).toBe(4);
    expect(layout.cells.map((cell) => [label(cell), cell.row, cell.rows, cell.column, cell.columns])).toEqual([
      ["eggs", 0, 1, 0, 1],
      ["step 1", 0, 2, 1, 1],
      ["step 3", 0, 3, 2, 1],
      ["dish", 0, 3, 3, 1],
      ["sugar", 1, 1, 0, 1],
      ["butter", 2, 1, 0, 1],
      ["step 2", 2, 1, 1, 1],
    ]);
  });

  test("a raw ingredient joining a deep branch spans the gap", () => {
    const tree = tree_of("Boil @water.\n\nAdd @pasta.\n\nToss with @basil.");
    const cells = table_layout(tree).cells;
    expect(cells.filter((cell) => cell.node.kind === "ingredient").map((cell) => [label(cell), cell.columns])).toEqual([
      ["water", 1],
      ["pasta", 2],
      ["basil", 3],
    ]);
  });

  test("every row is covered exactly once per column", () => {
    const tree = tree_of("= A\nMix @a and @b in a #bowl.\n\nAdd @c.\n\n= B\nHeat @d in a #pan.\n\n= Finish\nCombine @a with @d.");
    const layout = table_layout(tree, "Dish");
    const grid = Array.from({ length: layout.rows }, () => Array<number>(layout.columns).fill(0));
    for (const cell of layout.cells)
      for (let row = cell.row; row < cell.row + cell.rows; row++)
        for (let column = cell.column; column < cell.column + cell.columns; column++) grid[row][column]++;
    expect(grid.flat().every((count) => count === 1)).toBe(true);
  });
});
