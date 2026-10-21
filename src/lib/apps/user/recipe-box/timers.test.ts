import { describe, expect, it } from "vitest";
import type { Job } from "$lib/core/api/services/scheduler";
import { cook_timer_input, cook_timer_of, cook_timers, find_cook_timer, format_countdown } from "./timers";

const recipe = { title: "Soup", path: "/home/Recipes/soup.cook" };

function job(key: string, label: string, end: number, armed = true): Job {
  const { key: _, ...input } = cook_timer_input(key, label, end, recipe, 0);
  return { ...input, id: `recipe-box:${key}`, app: "recipe-box", armed };
}

describe("cook timers", () => {
  it("are one-shot timer jobs with a Stop command and a click back to the recipe", () => {
    expect(cook_timer_input("timer-a", "Boil", 60_000, recipe, 1_000)).toEqual({
      key: "timer-a",
      title: "Boil",
      message: "Time's up · Soup",
      at: { epoch: 61_000 },
      kind: "timer",
      actions: [{ label: "Stop", command: "recipe timer stop timer-a" }],
      open: { app: "recipe-box", props: { path: recipe.path } },
    });
  });

  it("read back running first, soonest first, then done", () => {
    const jobs = [job("timer-c", "Rest", 5_000, false), job("timer-b", "Bake", 9_000), job("timer-a", "Boil", 3_000)];
    expect(cook_timers(jobs).map((timer) => [timer.key, timer.done])).toEqual([
      ["timer-a", false],
      ["timer-b", false],
      ["timer-c", true],
    ]);
    expect(cook_timer_of({ ...jobs[0], app: "clock", id: "clock:timer-c" })).toBeNull();
    expect(cook_timer_of(jobs[1])?.path).toBe(recipe.path);
  });

  it("are found by key, key prefix or label", () => {
    const timers = cook_timers([job("timer-ab1", "Boil", 1), job("timer-ab2", "boil", 2), job("timer-cd", "Bake", 3)]);
    expect(find_cook_timer(timers, "timer-cd")).toMatchObject({ label: "Bake" });
    expect(find_cook_timer(timers, "recipe-box:timer-cd")).toMatchObject({ label: "Bake" });
    expect(find_cook_timer(timers, "timer-ab")).toMatch(/ambiguous/);
    expect(find_cook_timer(timers, "bake")).toMatchObject({ key: "timer-cd" });
    expect(find_cook_timer(timers, "BOIL")).toMatch(/more than one/);
    expect(find_cook_timer(timers, "nope")).toMatch(/no cook timer/);
  });

  it("count down in minutes and seconds", () => {
    expect(format_countdown(65_000)).toBe("1:05");
    expect(format_countdown(3_725_000)).toBe("1:02:05");
  });
});
