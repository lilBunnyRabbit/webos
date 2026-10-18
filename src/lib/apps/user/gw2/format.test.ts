import { describe, expect, it } from "vitest";
import { boss_name, format_coins, format_progress, format_stack, fraction, split_coins } from "./format";

describe("coins", () => {
  it("splits copper into gold, silver and copper", () => {
    expect(split_coins(1_234_567)).toEqual({ gold: 123, silver: 45, copper: 67 });
    expect(split_coins(-5)).toEqual({ gold: 0, silver: 0, copper: 0 });
  });

  it("formats from the largest unit held, padding the ones after it", () => {
    expect(format_coins(1_234_567)).toBe("123g 45s 67c");
    expect(format_coins(12_340_005)).toBe("1,234g 00s 05c");
    expect(format_coins(305)).toBe("3s 05c");
    expect(format_coins(7)).toBe("7c");
    expect(format_coins(0)).toBe("0c");
  });
});

describe("boss_name", () => {
  it("title-cases ids, keeping small words and numerals", () => {
    expect(boss_name("admiral_taidha_covington")).toBe("Admiral Taidha Covington");
    expect(boss_name("inquest_golem_mark_ii")).toBe("Inquest Golem Mark II");
    expect(boss_name("mists_and_monsters_titans")).toBe("Mists and Monsters Titans");
  });
});

describe("progress", () => {
  it("caps the shown count at the goal", () => {
    expect(format_progress(7, 5)).toBe("5 / 5");
    expect(format_progress(1200, 2500)).toBe("1,200 / 2,500");
  });

  it("clamps the fraction and treats an empty goal as done", () => {
    expect(fraction(3, 4)).toBe(0.75);
    expect(fraction(9, 4)).toBe(1);
    expect(fraction(0, 0)).toBe(1);
  });
});

it("shortens stack counts from a thousand up", () => {
  expect(format_stack(250)).toBe("250");
  expect(format_stack(7769)).toBe("7.8k");
  expect(format_stack(1_250_000)).toBe("1.3m");
});
