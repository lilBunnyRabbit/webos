import { describe, expect, test } from "vitest";
import { AppCategory, type AppListing } from "./type";
import { group_apps, search_app_names, search_apps, within_one_edit } from "./search";

const app = (name: string, extra: Partial<AppListing> = {}) =>
  ({ id: name.toLowerCase().replace(/\s+/g, "-"), name, category: AppCategory.UTILITIES, system: false, ...extra }) as AppListing;

const names = (apps: AppListing[]) => apps.map((manifest) => manifest.name);

describe("search_apps", () => {
  test("an empty query lists every app by name", () => {
    expect(names(search_apps([app("Snake"), app("Calculator")], "  "))).toEqual(["Calculator", "Snake"]);
  });

  test("ranks name prefix, then word prefix, then name substring, then other fields", () => {
    const apps = [
      app("Unit Converter", { keywords: ["scale"] }),
      app("Vocal Lab"),
      app("Work Calendar"),
      app("Calculator"),
      app("Notes", { description: "Recall later" }),
    ];
    expect(names(search_apps(apps, "cal"))).toEqual(["Calculator", "Work Calendar", "Vocal Lab", "Unit Converter", "Notes"]);
  });

  test("matches the category label and is case-insensitive", () => {
    const apps = [app("Snake", { category: AppCategory.GAMES }), app("Calculator")];
    expect(names(search_apps(apps, "GAMES"))).toEqual(["Snake"]);
  });

  test("no match is an empty list", () => {
    expect(search_apps([app("Snake")], "zzz")).toEqual([]);
  });
});

describe("search_app_names", () => {
  test("matches the name only, never keywords, description or category", () => {
    const apps = [app("Settings"), app("Funky", { keywords: ["settle"], description: "Set the beat" }), app("Snake", { category: AppCategory.GAMES })];
    expect(names(search_app_names(apps, "set"))).toEqual(["Settings"]);
    expect(search_app_names(apps, "games")).toEqual([]);
  });

  test("a blank query lists every app by name", () => {
    expect(names(search_app_names([app("Snake"), app("Calculator")], " "))).toEqual(["Calculator", "Snake"]);
  });
});

describe("group_apps", () => {
  test("sections follow category order with system last, skipping empty ones", () => {
    const apps = [
      app("Snake", { category: AppCategory.GAMES }),
      app("Settings", { system: true }),
      app("Paint", { category: AppCategory.MEDIA }),
      app("Minesweeper", { category: AppCategory.GAMES }),
    ];
    expect(group_apps(apps).map((section) => [section.label, names(section.apps)])).toEqual([
      ["Media", ["Paint"]],
      ["Games", ["Minesweeper", "Snake"]],
      ["System", ["Settings"]],
    ]);
  });
});

describe("search words and typos", () => {
  const apps = [
    app("Word Search", { category: AppCategory.GAMES, keywords: ["puzzle", "letters"] }),
    app("Sudoku", { category: AppCategory.GAMES, keywords: ["puzzle", "numbers"] }),
    app("Solitaire", { category: AppCategory.GAMES, keywords: ["cards", "card game"] }),
    app("Image Editor", { keywords: ["photo", "crop"], description: "Edit a picture" }),
  ];

  test("every word must match somewhere", () => {
    expect(names(search_apps(apps, "word puzzle"))).toEqual(["Word Search"]);
    expect(names(search_apps(apps, "card game"))).toEqual(["Solitaire"]);
    expect(names(search_apps(apps, "photo edit"))).toEqual(["Image Editor"]);
  });

  test("a full name with a space still ranks first", () => {
    expect(names(search_apps([app("Image Crop"), ...apps], "image e"))[0]).toBe("Image Editor");
  });

  test("words of five letters or more forgive one typo, ranked after exact matches", () => {
    expect(names(search_apps(apps, "puzle"))).toEqual(["Sudoku", "Word Search"]);
    expect(names(search_apps([...apps, app("Puzzle Box")], "puzzle"))[0]).toBe("Puzzle Box");
    expect(names(search_apps(apps, "pzzle"))).toEqual(["Sudoku", "Word Search"]);
    expect(names(search_apps(apps, "sodoku"))).toEqual(["Sudoku"]);
  });

  test("short words stay exact", () => {
    expect(names(search_apps(apps, "crd"))).toEqual([]);
  });

  test("within_one_edit", () => {
    expect(within_one_edit("puzzle", "puzle")).toBe(true);
    expect(within_one_edit("puzzle", "puzzel")).toBe(true);
    expect(within_one_edit("puzzle", "pazzle")).toBe(true);
    expect(within_one_edit("puzzle", "pzle")).toBe(false);
  });
});

