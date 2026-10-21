import { describe, expect, test } from "vitest";
import { AiAvailability } from "$lib/core/api/services/ai/type";
import { combine } from "./gate";

describe("combine", () => {
  test("no beats download beats ready", () => {
    expect(combine([AiAvailability.READY, AiAvailability.READY])).toBe(AiAvailability.READY);
    expect(combine([AiAvailability.READY, AiAvailability.DOWNLOAD])).toBe(AiAvailability.DOWNLOAD);
    expect(combine([AiAvailability.DOWNLOAD, AiAvailability.NO, AiAvailability.READY])).toBe(AiAvailability.NO);
  });

  test("nothing required is ready", () => {
    expect(combine([])).toBe(AiAvailability.READY);
  });
});
