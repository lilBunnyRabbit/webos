import { describe, expect, test } from "vitest";
import { app_authors, author_link, author_names, credits, OWNER } from "./authors";
import type { AppManifest } from "./type";

const app = (id: string, authors?: AppManifest["authors"]) => ({ id, name: id[0].toUpperCase() + id.slice(1), authors }) as AppManifest;

describe("app_authors", () => {
  test("no authors, or an empty list, means the owner", () => {
    expect(app_authors(app("paint"))).toEqual([OWNER]);
    expect(app_authors(app("paint", []))).toEqual([OWNER]);
    expect(author_names(app("paint", [{ name: "Ana" }, { name: "Bo" }]))).toBe("Ana, Bo");
  });

  test("links go to GitHub first, then the url, else nowhere", () => {
    expect(author_link({ name: "A", github: "ana", url: "https://ana.dev" })).toBe("https://github.com/ana");
    expect(author_link({ name: "A", url: "https://ana.dev" })).toBe("https://ana.dev");
    expect(author_link({ name: "A" })).toBeNull();
  });
});

describe("credits", () => {
  test("one entry per author, the owner first, then by app count", () => {
    const ana = { name: "Ana", github: "ana" };
    const bo = { name: "Bo" };
    const list = credits([
      app("snake", [ana]),
      app("maze", [ana, bo]),
      app("paint"),
      app("kanban", [{ name: "Ana again", github: "ANA" }]),
    ]);
    expect(list.map(({ author, apps }) => [author.name, apps.map((manifest) => manifest.id)])).toEqual([
      ["lilBunnyRabbit", ["paint"]],
      ["Ana", ["kanban", "maze", "snake"]],
      ["Bo", ["maze"]],
    ]);
  });
});
