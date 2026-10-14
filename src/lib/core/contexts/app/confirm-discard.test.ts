import { describe, expect, test, vi } from "vitest";
import { confirm_discard } from "./confirm-discard";

describe("confirm_discard", () => {
  test("asks a danger confirm naming the document and returns its answer", async () => {
    const confirm = vi.fn(async () => false);
    expect(await confirm_discard({ confirm }, "notes.txt")).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Discard changes to “notes.txt”?", {
      detail: "Your unsaved changes will be lost.",
      confirm_label: "Discard",
      danger: true,
    });
  });
});
