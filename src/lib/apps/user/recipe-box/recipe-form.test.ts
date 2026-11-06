import { describe, expect, test } from "vitest";
import { ingredient_list } from "./amounts";
import { parse_cook, steps } from "./cooklang";
import { empty_form, form_from_cook, form_issues, form_to_cook, FormIssue, link_steps, set_meta, type FormIngredient, type RecipeForm } from "./recipe-form";

const row = (amount: string, unit: string, name: string): FormIngredient => ({ id: name, amount, unit, name, fixed: false });

const pancakes = (): RecipeForm => ({
  ...empty_form(),
  title: "Pancakes",
  servings: "4",
  tags: ["breakfast", "sweet"],
  source: "https://example.com/pancakes",
  ingredients: [row("200", "g", "flour"), row("2", "", "eggs"), row("1/2", "tsp", "salt"), row("", "", "maple syrup")],
  steps: [
    { id: "a", text: "Whisk the Flour, eggs and salt." },
    { id: "b", text: "Fry for ~{2%minutes} a side." },
  ],
});

describe("link_steps", () => {
  test("links the first whole-word mention, keeps the step's spelling and braces multi-word names", () => {
    const { steps: out, unlinked } = link_steps(["Add flour, then more flour. Saltwater stays."], [row("200", "g", "flour"), row("", "", "salt")]);
    expect(out).toEqual(["Add @flour{200%g}, then more flour. Saltwater stays."]);
    expect(unlinked.map((entry) => entry.name)).toEqual(["salt"]);
  });

  test("claims longer names first and gives a second row of a name the next mention", () => {
    const { steps: out } = link_steps(
      ["Melt the butter.", "Spread peanut butter, then the rest of the butter."],
      [row("50", "g", "butter"), row("2", "tbsp", "peanut butter"), row("10", "g", "butter")]
    );
    expect(out).toEqual(["Melt the @butter{50%g}.", "Spread @peanut butter{2%tbsp}, then the rest of the @butter{10%g}."]);
  });

  test("never links inside Cooklang kept in a step", () => {
    expect(link_steps(["Use a #pot{} for ~rice{10%min}, add rice."], [row("1", "cup", "rice")]).steps).toEqual(["Use a #pot{} for ~rice{10%min}, add @rice{1%cup}."]);
  });
});

describe("form_to_cook", () => {
  test("writes front matter, links steps and lists unmentioned ingredients first", () => {
    const source = form_to_cook(pancakes());
    expect(source).toBe(
      [
        "---",
        "title: Pancakes",
        "servings: 4",
        "tags: [breakfast, sweet]",
        "source: https://example.com/pancakes",
        "---",
        "",
        "You'll need @maple syrup{}.",
        "",
        "Whisk the @Flour{200%g}, @eggs{2} and @salt{1/2%tsp}.",
        "",
        "Fry for ~{2%minutes} a side.",
        "",
      ].join("\n")
    );
    expect(ingredient_list(parse_cook(source)).map((entry) => entry.name)).toEqual(["maple syrup", "Flour", "eggs", "salt"]);
  });

  test("keeps notes, optional and fixed amounts through the name and the hidden flag", () => {
    const form = { ...empty_form(), ingredients: [{ ...row("1", "tsp", "salt"), fixed: true }, row("200", "g", "butter, softened"), row("", "", "parsley (optional)")], steps: [{ id: "a", text: "Beat butter with salt, top with parsley." }] };
    expect(form_to_cook(form)).toBe("Beat @butter{200%g}(softened) with @salt{=1%tsp}, top with @?parsley{}.\n");
  });
});

describe("form_from_cook", () => {
  test("round-trips what the form wrote, extra keys included", () => {
    const form = { ...pancakes(), extra: { favorite: "true", time: "20 min" } };
    const source = form_to_cook(form);
    const back = form_from_cook(source);
    expect(back.title).toBe("Pancakes");
    expect(back.tags).toEqual(["breakfast", "sweet"]);
    expect(back.extra).toEqual({ favorite: "true", time: "20 min" });
    expect(back.steps.map((step) => step.text)).toEqual(["Whisk the Flour, eggs and salt.", "Fry for ~{2%minutes} a side."]);
    expect(back.ingredients.map((entry) => [entry.amount, entry.unit, entry.name])).toEqual([
      ["", "", "maple syrup"],
      ["200", "g", "Flour"],
      ["2", "", "eggs"],
      ["1/2", "tsp", "salt"],
    ]);
    expect(form_to_cook(back)).toBe(source);
    expect(form_issues(source)).toEqual([]);
  });

  test("turns hand-written markers into plain words and keeps cookware as written", () => {
    const back = form_from_cook("Boil @water{1%l} in a #pot{}.\\\nAdd @salt.");
    expect(back.steps.map((step) => step.text)).toEqual(["Boil water in a #pot{}.\nAdd salt."]);
    expect(steps(parse_cook(form_to_cook(back)))).toEqual(steps(parse_cook("Boil @water{1%l} in a #pot{}.\\\nAdd @salt.")));
  });
});

describe("form_issues", () => {
  test("names what the form can't keep", () => {
    expect(form_issues("== Dough ==\nMix @flour{}.\n\n> Rest overnight.\n\n-- a comment")).toEqual([FormIssue.SECTIONS, FormIssue.NOTES, FormIssue.COMMENTS]);
    expect(form_issues("Salt the water, add @salt{1%tsp}.")).toEqual([FormIssue.MOVED]);
    expect(form_issues("---\ntitle: Pie\n# from grandma\ndescription: >\n  Flaky crust.\n---\nBake @pie{}.")).toEqual([FormIssue.HEADER]);
  });

  test("keeps optional cookware", () => {
    expect(form_issues("Blend @soup{} in a #?blender{}.")).toEqual([]);
  });
});

describe("set_meta", () => {
  test("adds, replaces and removes one key, leaving the rest untouched", () => {
    const source = "---\ntitle: Soup\ntags:\n  - a\n---\n\n-- keep me\nCook @soup{}.";
    const on = set_meta(source, "favorite", "true");
    expect(on).toBe("---\ntitle: Soup\ntags:\n  - a\nfavorite: true\n---\n\n-- keep me\nCook @soup{}.");
    expect(set_meta(on, "favorite", null)).toBe(source);
    expect(set_meta(source, "tags", null)).toBe("---\ntitle: Soup\n---\n\n-- keep me\nCook @soup{}.");
    expect(set_meta("Cook.", "favorite", "true")).toBe("---\nfavorite: true\n---\nCook.");
  });
});
