import type { Amount, Ingredient, Recipe, Step } from "./cooklang";

/**
 * The Cooking for Engineers card as a tree: ingredients are leaves, each step joins its children, the dish is the root.
 *
 * Which earlier results a step takes in is guessed from the text, in this order:
 * 1. Results that share an ingredient it names again ("fold the @flour mixture in") or cookware it uses again (the same #bowl).
 * 2. Otherwise, a step that only brings new ingredients in new cookware starts its own branch. Sections don't: "= Finish"
 *    carries on as often as "= Topping" starts something new, and a topping made in its own #bowl branches anyway.
 * 3. Otherwise it carries on from the latest open result: recipes read top to bottom.
 * A step that names no ingredient and has nothing to take in yet ("preheat the oven") is a prep note, not a cell.
 * Results still open at the end are combined into the dish.
 */
export interface TableIngredient {
  kind: "ingredient";
  name: string;
  amount: Amount | null;
  note: string;
}

export interface TableStep {
  kind: "step";
  step: Step;
  section: string | null;
  children: TableNode[];
}

export type TableNode = TableIngredient | TableStep;

export interface RecipeTree {
  dish: TableStep | { kind: "dish"; children: TableNode[] } | null;
  prep: Step[];
}

interface Open {
  node: TableStep;
  ingredients: Set<string>;
  cookware: Set<string>;
}

const key = (name: string) => name.trim().toLowerCase();

export function recipe_tree(recipe: Recipe): RecipeTree {
  const open: Open[] = [];
  const seen = new Set<string>();
  const used_cookware = new Set<string>();
  const prep: Step[] = [];

  for (const section of recipe.sections) {
    for (const block of section.blocks) {
      if (block.kind !== "step") continue;
      const ingredients = block.items.filter((item): item is Ingredient => item.kind === "ingredient");
      const cookware = new Set(block.items.flatMap((item) => (item.kind === "cookware" ? [key(item.name)] : [])));
      const fresh: TableIngredient[] = [];
      const repeated = new Set<string>();
      for (const item of ingredients) {
        const name = key(item.name);
        if (seen.has(name)) repeated.add(name);
        else {
          seen.add(name);
          fresh.push({ kind: "ingredient", name: item.name, amount: item.amount, note: item.note });
        }
      }

      let taken = open.filter(
        (entry) => [...repeated].some((name) => entry.ingredients.has(name)) || [...cookware].some((name) => entry.cookware.has(name))
      );
      if (taken.length === 0 && open.length > 0) {
        const new_cookware = cookware.size > 0 && [...cookware].every((name) => !used_cookware.has(name));
        const branches = fresh.length > 0 && repeated.size === 0 && new_cookware;
        if (!branches) taken = [open.at(-1)!];
      }
      cookware.forEach((name) => used_cookware.add(name));

      if (fresh.length === 0 && taken.length === 0) {
        prep.push(block);
        continue;
      }

      const node: TableStep = { kind: "step", step: block, section: section.name, children: [...taken.map((entry) => entry.node), ...fresh] };
      const merged: Open = {
        node,
        ingredients: new Set([...fresh.map((item) => key(item.name)), ...taken.flatMap((entry) => [...entry.ingredients])]),
        cookware: new Set([...cookware, ...taken.flatMap((entry) => [...entry.cookware])]),
      };
      for (const entry of taken) open.splice(open.indexOf(entry), 1);
      open.push(merged);
    }
  }

  if (open.length === 0) return { dish: null, prep };
  if (open.length === 1) return { dish: open[0].node, prep };
  return { dish: { kind: "dish", children: open.map((entry) => entry.node) }, prep };
}

export interface TableCell {
  node: TableNode | { kind: "dish" };
  row: number;
  rows: number;
  column: number;
  columns: number;
}

export interface TableLayout {
  rows: number;
  columns: number;
  /** Row-major, then by column: the order `<td>`s go into a `<table>` with rowspan and colspan. */
  cells: TableCell[];
}

function depth(node: TableNode | { kind: "dish"; children: TableNode[] }): number {
  if (node.kind === "ingredient") return 0;
  return 1 + Math.max(0, ...node.children.map(depth));
}

/**
 * Each node's column is its depth (ingredients 0, a step one right of its deepest child), and its cell stretches right
 * up to its parent, so a step that joins a deep branch and a raw ingredient keeps both rows flush.
 */
export function table_layout(tree: RecipeTree, dish_title: string | null = null): TableLayout {
  const cells: TableCell[] = [];
  if (!tree.dish) return { rows: 0, columns: 0, cells };
  const root = tree.dish;
  const root_depth = depth(root);
  const columns = root_depth + (dish_title !== null && root.kind === "step" ? 2 : 1);
  let next_row = 0;

  const place = (node: TableNode | { kind: "dish"; children: TableNode[] }, parent_column: number): number => {
    const column = depth(node);
    const span_end = parent_column;
    if (node.kind === "ingredient") {
      cells.push({ node, row: next_row, rows: 1, column: 0, columns: span_end });
      next_row++;
      return 1;
    }
    const start = next_row;
    const cell: TableCell = { node, row: start, rows: 0, column, columns: span_end - column };
    cells.push(cell);
    let rows = 0;
    for (const child of node.children) rows += place(child, column);
    cell.rows = Math.max(rows, 1);
    if (rows === 0) next_row++;
    return cell.rows;
  };

  if (root.kind === "step" && dish_title !== null) {
    const rows = place(root, root_depth + 1);
    cells.push({ node: { kind: "dish" }, row: 0, rows, column: root_depth + 1, columns: 1 });
  } else {
    place(root, root_depth + 1);
  }

  cells.sort((a, b) => a.row - b.row || a.column - b.column);
  return { rows: next_row, columns, cells };
}
