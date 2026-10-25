import { create_rng } from "$lib/core/utils/random";
import { describe, expect, it } from "vitest";
import { from_hex } from "../color-tools/color";
import { convert, MODELS } from "../color-tools/models";
import { ATLAS, Tier } from "./atlas";
import {
  atlas_model,
  challenge_props,
  draw_run,
  draw_start,
  draw_target,
  is_pool,
  MIXED,
  PLAYABLE,
  play_channels,
  puzzle_number,
  record_dex,
  resolve_seed,
  round_delta,
  route_to_srgb,
  round_score,
  ROUNDS,
  RUN_TIERS,
  share_head,
  share_text,
  target_coords,
} from "./game";

describe("atlas table", () => {
  it("has one row per package model", () => {
    expect(ATLAS.map((entry) => entry.id).sort()).toEqual(MODELS.map((model) => model.id).sort());
    expect(ATLAS).toHaveLength(70);
  });

  it("keeps the byte model out of play", () => {
    expect(PLAYABLE.some((item) => item.id === "srgb8")).toBe(false);
    expect(PLAYABLE).toHaveLength(69);
    expect(is_pool("srgb8")).toBe(false);
    expect(is_pool("oklch")).toBe(true);
    expect(is_pool(Tier.EXOTIC)).toBe(true);
    expect(is_pool("nope")).toBe(false);
  });

  it("has every tier in play", () => {
    for (const tier of Object.values(Tier)) expect(PLAYABLE.filter((item) => item.tier === tier).length).toBeGreaterThanOrEqual(ROUNDS);
  });
});

describe("sliders", () => {
  it("keep reference ranges that fit sRGB", () => {
    const oklch = play_channels(atlas_model("oklch")!.model);
    expect(oklch.map((channel) => [channel.min, channel.max])).toEqual([
      [0, 1],
      [0, 0.4],
      [0, 360],
    ]);
  });

  it("narrow a scene-linear range to where sRGB lives", () => {
    for (const channel of play_channels(atlas_model("acescg")!.model)) {
      expect(channel.min).toBe(0);
      expect(channel.max).toBeLessThan(1.2);
    }
  });
});

describe("targets", () => {
  it("are reachable on every playable model's sliders, Ryb included", () => {
    for (const item of PLAYABLE) {
      const channels = play_channels(item.model);
      const rng = create_rng(item.id.length * 7919);
      for (let draw = 0; draw < 25; draw++) {
        const target = draw_target(item.model, rng);
        expect(target, item.id).not.toBe("#808080");
        const color = convert(from_hex(target)!, item.model);
        expect(color, `${item.id} ${target}`).not.toBeNull();
        color!.coords.forEach((value, index) => {
          const channel = channels[index];
          if (channel.hue) return;
          expect(value, `${item.id} ${channel.name}`).toBeGreaterThanOrEqual(channel.min - 1e-9);
          expect(value, `${item.id} ${channel.name}`).toBeLessThanOrEqual(channel.max + 1e-9);
        });
      }
    }
  });

  it("start the sliders inside their ranges", () => {
    for (const item of PLAYABLE) {
      const channels = play_channels(item.model);
      const start = draw_start(item.model, create_rng(3));
      start.forEach((value, index) => {
        expect(value).toBeGreaterThanOrEqual(channels[index].min);
        expect(value).toBeLessThanOrEqual(channels[index].max);
      });
    }
  });

  it("score 100 when the sliders sit on the target", () => {
    for (const item of PLAYABLE) {
      const target = draw_target(item.model, create_rng(11));
      const delta = round_delta(target, item.model, target_coords(target, item.model)!);
      expect(delta, item.id).toBeLessThan(0.5);
      expect(round_score(delta)).toBeGreaterThan(96);
    }
  });
});

describe("runs", () => {
  it("draw 2 Familiar, 2 Perceptual and 1 Exotic, all different", () => {
    const run = draw_run(42, MIXED);
    expect(run.map((round) => round.model.tier)).toEqual(RUN_TIERS);
    expect(new Set(run.map((round) => round.model.id)).size).toBe(ROUNDS);
  });

  it("replay from the seed", () => {
    const seed = resolve_seed("2026-10-25");
    expect(seed).toBe(resolve_seed("2026-10-25"));
    const a = draw_run(seed, MIXED);
    const b = draw_run(seed, MIXED);
    expect(a.map((round) => [round.model.id, round.target, round.start])).toEqual(b.map((round) => [round.model.id, round.target, round.start]));
  });

  it("take a tier or one model", () => {
    const exotic = draw_run(7, Tier.EXOTIC);
    expect(exotic.every((round) => round.model.tier === Tier.EXOTIC)).toBe(true);
    expect(new Set(exotic.map((round) => round.model.id)).size).toBe(ROUNDS);
    expect(draw_run(7, "hct").every((round) => round.model.id === "hct")).toBe(true);
  });
});

describe("scoring and the dex", () => {
  it("loses 8 points per ΔE", () => {
    expect(round_score(0)).toBe(100);
    expect(round_score(2.5)).toBe(80);
    expect(round_score(20)).toBe(0);
  });

  it("collects under ΔE 5 and keeps the best", () => {
    expect(record_dex({}, "hsl", 5)).toEqual({});
    const dex = record_dex({}, "hsl", 3.21);
    expect(dex).toEqual({ hsl: 3.21 });
    expect(record_dex(dex, "hsl", 4)).toBe(dex);
    expect(record_dex(dex, "hsl", 1)).toEqual({ hsl: 1 });
  });
});

describe("routes", () => {
  it("run from the model to sRGB through the graph", () => {
    expect(route_to_srgb(atlas_model("oklch")!).map((item) => item.id)).toEqual(["oklch", "oklab", "xyz-d65", "srgb-linear", "srgb"]);
    expect(route_to_srgb(atlas_model("srgb8")!).map((item) => item.id)).toEqual(["srgb8", "srgb"]);
  });
});

describe("share", () => {
  it("numbers dailies from launch day", () => {
    expect(puzzle_number("2026-10-25")).toBe(1);
    expect(share_head("2026-10-27", MIXED)).toBe("Colour Atlas #3");
    expect(share_head(9, Tier.EXOTIC)).toBe("Colour Atlas · Practice · Exotic");
  });

  it("writes a total and a band per round", () => {
    expect(share_text("Colour Atlas #1", [95, 72.5, 41, 10, 100], "https://x")).toBe("Colour Atlas #1  318.5/500\n🟩🟨🟧🟥🟩\nhttps://x");
    expect(challenge_props(5, MIXED)).toEqual({ seed: 5 });
    expect(challenge_props(5, "hct")).toEqual({ seed: 5, pool: "hct" });
  });
});
