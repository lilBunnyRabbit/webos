import { describe, expect, test } from "vitest";
import type { AppManifest } from "../apps/type";
import { sample_files } from "./samples";

const app = (id: string, associations: string[]) => ({ id, associations }) as AppManifest;
const names = (apps?: AppManifest[]) => sample_files(apps).map(({ name }) => name);
const welcome = (apps?: AppManifest[]) => sample_files(apps).find(({ name }) => name === "Welcome.md")!.content;

describe("sample_files", () => {
  test("without a registry, every sample and its Welcome line", () => {
    expect(names()).toEqual(["Welcome.md", "Bouncing ball.hopsprite", "Fruit.csv", "Sunset.svg", "Burrow.fontmaker"]);
    expect(welcome()).toContain("Hopsprite");
  });

  test("only files a registered app opens, and Welcome names only those", () => {
    const core = [app("csv-viewer", [".csv"]), app("media-preview", ["image/*"]), app("text-editor", [".md"])];
    expect(names(core)).toEqual(["Welcome.md", "Fruit.csv", "Sunset.svg"]);
    expect(welcome(core)).not.toMatch(/Hopsprite|Font Maker/);
    expect(welcome(core)).toContain("**Sunset.svg**");
  });
});
