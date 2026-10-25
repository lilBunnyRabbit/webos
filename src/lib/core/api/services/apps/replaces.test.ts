import { describe, expect, test } from "vitest";
import { current_ids, replacing_apps, resolve_replaced } from "./replaces";
import type { AppManifest } from "./type";

const app = (id: string, replaces?: AppManifest["replaces"]) => ({ id, replaces }) as AppManifest;

const apps = [
  app("color-recall", [{ app: "color-games" }, { app: "color-games", props: { mode: "recall" } }]),
  app("odd-one-out", [{ app: "color-games", props: { mode: "odd-one-out" } }]),
  app("hex-guess", [{ app: "color-games", props: { mode: "hex-guess" } }]),
  app("letterer", [{ app: "wordle" }]),
  app("notes"),
];

describe("resolve_replaced", () => {
  test("matching props pick the app and are consumed", () => {
    expect(resolve_replaced(apps, "color-games", { mode: "odd-one-out", seed: "2026-10-20" })).toEqual({
      id: "odd-one-out",
      props: { seed: "2026-10-20" },
    });
    expect(resolve_replaced(apps, "color-games", { mode: "hex-guess" })).toEqual({ id: "hex-guess", props: undefined });
  });

  test("the entry naming more props wins over the bare one", () => {
    expect(resolve_replaced(apps, "color-games", { mode: "recall", seed: 7 })).toEqual({ id: "color-recall", props: { seed: 7 } });
  });

  test("no props, or props no entry names, go to the entry without props", () => {
    expect(resolve_replaced(apps, "color-games", undefined)).toEqual({ id: "color-recall", props: undefined });
    expect(resolve_replaced(apps, "color-games", { mode: "missing", seed: 3 })).toEqual({
      id: "color-recall",
      props: { mode: "missing", seed: 3 },
    });
  });

  test("an id nothing replaces stays unresolved", () => {
    expect(resolve_replaced(apps, "paint", undefined)).toBeNull();
    const without_bare = [app("odd-one-out", [{ app: "color-games", props: { mode: "odd-one-out" } }])];
    expect(resolve_replaced(without_bare, "color-games", undefined)).toBeNull();
  });
});

describe("replacing_apps", () => {
  test("every app with an entry for the id", () => {
    expect(replacing_apps(apps, "color-games")).toEqual(["color-recall", "odd-one-out", "hex-guess"]);
    expect(replacing_apps(apps, "paint")).toEqual([]);
  });
});

describe("current_ids", () => {
  test("known ids stay, replaced ones expand once, unknown ones drop", () => {
    const known = (id: string) => apps.some((manifest) => manifest.id === id);
    expect(current_ids(apps, ["notes", "color-games", "odd-one-out", "gone"], known)).toEqual([
      "notes",
      "color-recall",
      "odd-one-out",
      "hex-guess",
    ]);
  });
});
