import { describe, expect, test } from "vitest";
import { parse_ingredient_line, parse_pasted, pasted_cook } from "./paste";

describe("parse_ingredient_line", () => {
  test("splits amount, unit and name", () => {
    expect(parse_ingredient_line("2 cups flour")).toEqual({ amount: "2", unit: "cups", name: "flour" });
    expect(parse_ingredient_line("1/2 tsp salt")).toEqual({ amount: "1/2", unit: "tsp", name: "salt" });
    expect(parse_ingredient_line("200g butter, softened")).toEqual({ amount: "200", unit: "g", name: "butter, softened" });
    expect(parse_ingredient_line("a pinch of salt")).toEqual({ amount: "1", unit: "pinch", name: "salt" });
    expect(parse_ingredient_line("▢ 1½ tbsp. olive oil")).toEqual({ amount: "1 1/2", unit: "tbsp", name: "olive oil" });
    expect(parse_ingredient_line("¼ cup (60ml) milk")).toEqual({ amount: "1/4", unit: "cup", name: "milk, 60ml" });
    expect(parse_ingredient_line("2-3 cloves garlic")).toEqual({ amount: "2-3", unit: "cloves", name: "garlic" });
    expect(parse_ingredient_line("2 large eggs")).toEqual({ amount: "2", unit: "", name: "large eggs" });
    expect(parse_ingredient_line("Salt and pepper to taste")).toEqual({ amount: "", unit: "", name: "Salt and pepper to taste" });
  });
});

describe("parse_pasted", () => {
  test("a blog post with headings drops the intro and the notes", () => {
    const pasted = parse_pasted(`Easy Banana Bread
This is the best banana bread my grandma ever made. Jump to recipe.
Prep Time: 10 mins
Servings: 8
Ingredients
3 ripe bananas
1/3 cup melted butter
¾ cup sugar
1 ½ cups all-purpose flour
Instructions
Preheat the oven to 175°C.
Mash the bananas in a bowl, then stir in the butter.
Mix in the sugar and flour.
Notes
Freezes well.`);
    expect(pasted.title).toBe("Easy Banana Bread");
    expect(pasted.servings).toBe("8");
    expect(pasted.ingredients.map((line) => [line.amount, line.unit, line.name])).toEqual([
      ["3", "", "ripe bananas"],
      ["1/3", "cup", "melted butter"],
      ["3/4", "cup", "sugar"],
      ["1 1/2", "cups", "all-purpose flour"],
    ]);
    expect(pasted.steps).toEqual(["Preheat the oven to 175°C.", "Mash the bananas in a bowl, then stir in the butter.", "Mix in the sugar and flour."]);
  });

  test("numbered steps and bulleted ingredients with colon headings", () => {
    const pasted = parse_pasted(`Tomato Soup
Serves 4
INGREDIENTS:
• 1 onion, chopped
• 800g tinned tomatoes
• For the topping:
• a handful of basil
METHOD:
1. Fry the onion until soft.
2) Add the tomatoes and simmer.
Step 3: Blend and top with basil.`);
    expect(pasted.servings).toBe("4");
    expect(pasted.ingredients.map((line) => line.name)).toEqual(["onion, chopped", "tinned tomatoes", "basil"]);
    expect(pasted.ingredients[2]).toEqual({ amount: "1", unit: "handful", name: "basil" });
    expect(pasted.steps).toEqual(["Fry the onion until soft.", "Add the tomatoes and simmer.", "Blend and top with basil."]);
  });

  test("no headings: amount-led lines are ingredients, the rest are steps", () => {
    const pasted = parse_pasted(`Quick omelette

2 eggs
1 tbsp milk
Whisk the eggs with the milk.
Cook in a hot pan for 2 minutes.`);
    expect(pasted.ingredients.map((line) => line.name)).toEqual(["eggs", "milk"]);
    expect(pasted.steps).toEqual(["Whisk the eggs with the milk.", "Cook in a hot pan for 2 minutes."]);
  });

  test("prose only: everything after the title becomes steps", () => {
    const pasted = parse_pasted("Toast\nPut bread in the toaster.\nButter it while hot.");
    expect(pasted).toEqual({ title: "Toast", servings: "", ingredients: [], steps: ["Put bread in the toaster.", "Butter it while hot."] });
  });
});

describe("pasted_cook", () => {
  test("a chat answer's code fence is unwrapped", () => {
    const answer = "Here you go:\n\n```cooklang\n---\ntitle: Toast\nservings: 1\n---\n\nToast @bread{2%slices}.\n```\n\nEnjoy!";
    expect(pasted_cook(answer)).toBe("---\ntitle: Toast\nservings: 1\n---\n\nToast @bread{2%slices}.\n");
  });

  test("markers without front matter are Cooklang", () => {
    expect(pasted_cook("Boil @water{1%l} for ~{5%minutes}.")).toBe("Boil @water{1%l} for ~{5%minutes}.\n");
  });

  test("a recipe from a website is not", () => {
    expect(pasted_cook("Banana bread\nServes 8\n\nIngredients\n3 bananas\n\nMethod\n1. Mash the bananas. Email me@example.com")).toBeNull();
  });
});
