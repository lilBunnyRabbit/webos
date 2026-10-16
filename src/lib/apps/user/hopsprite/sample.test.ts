import { describe, expect, test } from "vitest";
import { sample_files } from "$lib/core/api/services/version/samples";
import { parse_sprite } from "./format";

describe("first-boot sample", () => {
  test("Bouncing ball.hopsprite parses", () => {
    const file = sample_files().find((sample) => sample.name.endsWith(".hopsprite"))!;
    const sprite = parse_sprite(file.content);
    expect(sprite.width).toBe(16);
    expect(sprite.frames).toHaveLength(6);
  });
});
