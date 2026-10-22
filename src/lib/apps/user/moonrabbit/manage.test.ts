import { describe, expect, test } from "vitest";
import { rename_error } from "./manage";
import type { JournalRef } from "./store";

const journals: JournalRef[] = ["Journal", "Dreams"].map((name) => ({ name, path: `/home/Journal/${name}`, header: null, stamp: 0 }));

describe("rename_error", () => {
  test("takes a free name, its own name and a change of case", () => {
    expect(rename_error("Travel", "Journal", journals)).toBeNull();
    expect(rename_error("Journal", "Journal", journals)).toBeNull();
    expect(rename_error("journal", "Journal", journals)).toBeNull();
  });

  test("refuses another journal's name in any case", () => {
    expect(rename_error("dreams", "Journal", journals)).toBe("Another journal has that name.");
  });

  test("refuses what creating would strip instead of renaming to something else", () => {
    for (const name of ["a/b", ".hidden", "what?", "   "]) expect(rename_error(name, "Journal", journals)).not.toBeNull();
  });
});
