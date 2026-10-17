import { describe, expect, test } from "vitest";
import {
  parse_amount,
  parse_cook,
  parse_quantity,
  parse_step_text,
  recipe_servings,
  recipe_tags,
  recipe_title,
  steps,
  type Ingredient,
  type Step,
} from "./cooklang";

const only_step = (source: string): Step => {
  const all = steps(parse_cook(source));
  expect(all).toHaveLength(1);
  return all[0];
};

describe("parse_quantity", () => {
  test("reads integers, decimals, fractions and mixed numbers", () => {
    expect(parse_quantity("2")).toBe(2);
    expect(parse_quantity("1.5")).toBe(1.5);
    expect(parse_quantity("2,5")).toBe(2.5);
    expect(parse_quantity("1/2")).toBe(0.5);
    expect(parse_quantity("1 1/2")).toBe(1.5);
  });

  test("leaves words and zero denominators as text", () => {
    expect(parse_quantity("a pinch")).toBeNull();
    expect(parse_quantity("1/0")).toBeNull();
    expect(parse_quantity("2-3")).toBeNull();
  });
});

describe("parse_amount", () => {
  test("splits quantity and unit at %", () => {
    expect(parse_amount("1/2%tbsp")).toEqual({ value: 0.5, text: "1/2", unit: "tbsp", fixed: false });
    expect(parse_amount("3")).toEqual({ value: 3, text: "3", unit: "", fixed: false });
  });

  test("marks = as fixed and keeps words", () => {
    expect(parse_amount("=1%tsp")).toEqual({ value: 1, text: "1", unit: "tsp", fixed: true });
    expect(parse_amount("some")).toEqual({ value: null, text: "some", unit: "", fixed: false });
    expect(parse_amount("")).toBeNull();
  });
});

describe("parse_step_text", () => {
  test("reads a single-word ingredient up to punctuation", () => {
    expect(parse_step_text("Crack @eggs, then whisk.")).toEqual([
      { kind: "text", value: "Crack " },
      { kind: "ingredient", name: "eggs", amount: null, note: "", optional: false, reference: null },
      { kind: "text", value: ", then whisk." },
    ]);
  });

  test("reads multi-word names closed by braces, with amount and note", () => {
    const [, ingredient] = parse_step_text("Add @garlic cloves{2%pieces}(minced) now");
    expect(ingredient).toEqual({
      kind: "ingredient",
      name: "garlic cloves",
      amount: { value: 2, text: "2", unit: "pieces", fixed: false },
      note: "minced",
      optional: false,
      reference: null,
    });
  });

  test("stops a multi-word name at another sigil", () => {
    const items = parse_step_text("Add @salt and @black pepper{1%tsp}");
    const names = items.filter((item): item is Ingredient => item.kind === "ingredient").map((item) => item.name);
    expect(names).toEqual(["salt", "black pepper"]);
  });

  test("reads optional ingredients and recipe references", () => {
    const [ingredient] = parse_step_text("@?chilli flakes{1%pinch}");
    expect(ingredient).toMatchObject({ name: "chilli flakes", optional: true });
    const [reference] = parse_step_text("@./sauces/Hollandaise{150%g}");
    expect(reference).toMatchObject({ name: "Hollandaise", reference: "./sauces/Hollandaise", amount: { value: 150, unit: "g" } });
  });

  test("a ? that doesn't follow the sigil is text", () => {
    expect(parse_step_text("@? thyme")).toEqual([{ kind: "text", value: "@? thyme" }]);
  });

  test("reads cookware, single and multi-word", () => {
    const items = parse_step_text("Mash in a #pot with a #potato masher{}.");
    expect(items.filter((item) => item.kind === "cookware")).toEqual([
      { kind: "cookware", name: "pot", amount: null, optional: false },
      { kind: "cookware", name: "potato masher", amount: null, optional: false },
    ]);
  });

  test("reads named and unnamed timers, and needs braces for one", () => {
    expect(parse_step_text("Boil ~eggs{3%minutes}")[1]).toEqual({
      kind: "timer",
      name: "eggs",
      amount: { value: 3, text: "3", unit: "minutes", fixed: false },
    });
    expect(parse_step_text("Bake ~{25%min}")[1]).toMatchObject({ kind: "timer", name: "", amount: { value: 25 } });
    expect(parse_step_text("approx ~5 min")).toEqual([{ kind: "text", value: "approx ~5 min" }]);
  });

  test("a lone sigil is text", () => {
    expect(parse_step_text("email me @ home # 5")).toEqual([{ kind: "text", value: "email me @ home # 5" }]);
  });
});

describe("parse_cook", () => {
  test("splits steps on blank lines and joins wrapped lines", () => {
    const recipe = parse_cook("Boil @water{1%l}\nin a #pot.\n\nAdd @pasta{500%g}.");
    const all = steps(recipe);
    expect(all.map((step) => step.number)).toEqual([1, 2]);
    expect(all[0].items.at(-1)).toEqual({ kind: "text", value: "." });
    expect(all[0].items.map((item) => item.kind)).toEqual(["text", "ingredient", "text", "cookware", "text"]);
  });

  test("a trailing backslash keeps a line break inside the step", () => {
    const step = only_step("First line \\\nsecond line");
    expect(step.items).toEqual([{ kind: "text", value: "First line\nsecond line" }]);
  });

  test("drops line and block comments", () => {
    const step = only_step("Add @salt -- to taste\nand [- not this -]stir");
    expect(step.items.map((item) => (item.kind === "text" ? item.value : item.name)).join("")).toBe("Add salt and stir");
    expect(steps(parse_cook("[- a\nmulti-line\ncomment -]\nStir."))).toHaveLength(1);
  });

  test("reads YAML front matter with scalars and both list forms", () => {
    const recipe = parse_cook(
      ["---", "title: Pancakes", "servings: 4", "tags: [breakfast, sweet]", "diet:", "  - vegetarian", '  - "quick"', "---", "Mix @flour{200%g}."].join("\n")
    );
    expect(recipe.metadata).toEqual({ title: "Pancakes", servings: "4", tags: ["breakfast", "sweet"], diet: ["vegetarian", "quick"] });
    expect(steps(recipe)).toHaveLength(1);
  });

  test("reads >> metadata lines anywhere", () => {
    const recipe = parse_cook(">> source: Grandma\n>> Servings: 2\n\nStir.");
    expect(recipe.metadata).toEqual({ source: "Grandma", servings: "2" });
    expect(steps(recipe)).toHaveLength(1);
  });

  test("groups steps into sections and numbers each section from 1", () => {
    const recipe = parse_cook("Prep.\n\n= Dough\nMix.\n\nKnead.\n\n== Filling ==\nChop.");
    expect(recipe.sections.map((section) => [section.name, section.blocks.length])).toEqual([
      [null, 1],
      ["Dough", 2],
      ["Filling", 1],
    ]);
    expect(steps(recipe).map((step) => step.number)).toEqual([1, 1, 2, 1]);
  });

  test("skips the unnamed section when the file starts with one", () => {
    expect(parse_cook("= Only\nStir.").sections.map((section) => section.name)).toEqual(["Only"]);
  });

  test("keeps notes as their own blocks, joining consecutive lines", () => {
    const recipe = parse_cook("> Best the day after.\n> Keeps for a week.\nStir.\n\n> Serve warm.");
    expect(recipe.sections[0].blocks).toEqual([
      { kind: "note", text: "Best the day after. Keeps for a week." },
      { kind: "step", number: 1, items: [{ kind: "text", value: "Stir." }] },
      { kind: "note", text: "Serve warm." },
    ]);
  });

  test("handles CRLF line endings", () => {
    expect(steps(parse_cook("Stir.\r\n\r\nServe."))).toHaveLength(2);
  });
});

describe("metadata helpers", () => {
  test("title falls back to the file name", () => {
    expect(recipe_title(parse_cook("Stir."), "Soup.cook")).toBe("Soup");
    expect(recipe_title(parse_cook(">> title: Tomato soup\nStir."), "Soup.cook")).toBe("Tomato soup");
  });

  test("servings take the first number", () => {
    expect(recipe_servings(parse_cook(">> servings: 2|4|8"))).toBe(2);
    expect(recipe_servings(parse_cook(">> serves: 4 people"))).toBe(4);
    expect(recipe_servings(parse_cook("Stir."))).toBeNull();
  });

  test("tags come from a list or a comma-separated string", () => {
    expect(recipe_tags(parse_cook(">> tags: dinner, #quick, dinner"))).toEqual(["dinner", "quick"]);
    expect(recipe_tags(parse_cook("---\ntags: [a, b]\n---\n"))).toEqual(["a", "b"]);
  });
});
