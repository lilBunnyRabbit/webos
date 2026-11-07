import { describe, expect, test } from "vitest";
import { LEVEL_COUNTS } from "./airport/game";
import airport_game from "./airport";
import ferry_game from "./ferry";
import forklift_game from "./forklift";
import mower_game from "./mower";
import airport, { LEVELS as AIRPORT_LEVELS } from "./airport/progress";
import { LEVEL_COUNT as FERRY_COUNT } from "./ferry/game";
import ferry, { LEVELS as FERRY_LEVELS } from "./ferry/progress";
import { LEVEL_COUNT as FORKLIFT_COUNT } from "./forklift/game";
import { LEVELS as FORKLIFT_LEVELS } from "./forklift/progress";
import { LEVEL_COUNT as MOWER_COUNT } from "./mower/game";
import { LEVELS as MOWER_LEVELS } from "./mower/progress";
import { COURSES } from "./parking/extreme/courses";
import { LEVEL_COUNT as PARKING_COUNT } from "./parking/game";
import parking, { COURSES as PARKING_COURSES, LEVELS as PARKING_LEVELS } from "./parking/progress";
import shunter_game from "./shunter";
import { LEVEL_COUNT as SHUNTER_COUNT } from "./shunter/levels";
import { LEVELS as SHUNTER_LEVELS } from "./shunter/progress";
import f1_game from "./f1";
import { LEVEL_COUNT as F1_COUNT } from "./f1/game";
import { LEVELS as F1_LEVELS } from "./f1/progress";
import rodeo_game from "./rodeo";
import { LEVEL_COUNT as RODEO_COUNT } from "./rodeo/game";
import { LEVELS as RODEO_LEVELS } from "./rodeo/progress";
import test_game from "./test";
import { LEVEL_COUNT as TEST_COUNT } from "./test/levels";
import test_progress, { LEVELS as TEST_LEVELS } from "./test/progress";
import valet_game from "./valet";
import { LEVEL_COUNT as VALET_COUNT } from "./valet/levels";
import valet, { LEVELS as VALET_LEVELS } from "./valet/progress";

// The yard's progress modules carry their own counts so it never loads a game; these keep them in step with the games.
describe("progress", () => {
  test("each game's progress counts the levels the game has", () => {
    expect(AIRPORT_LEVELS).toEqual(LEVEL_COUNTS);
    expect(FERRY_LEVELS).toBe(FERRY_COUNT);
    expect(FORKLIFT_LEVELS).toBe(FORKLIFT_COUNT);
    expect(MOWER_LEVELS).toBe(MOWER_COUNT);
    expect(PARKING_LEVELS).toBe(PARKING_COUNT);
    expect(PARKING_COURSES).toBe(COURSES.length);
    expect(SHUNTER_LEVELS).toBe(SHUNTER_COUNT);
    expect(RODEO_LEVELS).toBe(RODEO_COUNT);
    expect(F1_LEVELS).toBe(F1_COUNT);
    expect(TEST_LEVELS).toBe(TEST_COUNT);
    expect(VALET_LEVELS).toBe(VALET_COUNT);
  });

  test("stars come from the save as it is on disk, and a bad one counts as none", () => {
    expect(ferry.read({ bests: {}, levels: { 1: 3, 2: 2 } })).toEqual({ stars: 5, total: 63 });
    expect(ferry.read(null)).toEqual({ stars: 0, total: 63 });
    expect(ferry.read({ levels: { 1: 9 } })).toEqual({ stars: 0, total: 63 });
    expect(airport.read({ best: {}, levels: { pushback: { 1: 3 }, tow: { 2: 1 } } })).toEqual({ stars: 4, total: 108 });
    expect(parking.read({ bests: {}, levels: { 1: 2 }, kinds: [], extreme: { planks: 3 } })).toEqual({ stars: 5, total: (PARKING_COUNT + COURSES.length) * 3 });
    const pass = { passed: true, serious: 0, dangerous: 0, ms: 1000 };
    expect(test_progress.read({ best: { market: { ...pass, minors: 0 }, "level-4": { ...pass, minors: 7 }, school: { ...pass, passed: false, minors: 0 } } })).toEqual({ stars: 4, total: 36 });
    expect(test_progress.read({ best: { market: "bad" } })).toEqual({ stars: 0, total: 36 });
    expect(valet.read({ best: { shifts: { score: 40, ms: 1, handed: 3, dents: 0 } } })).toEqual({ stars: 0, total: 36 });
    expect(valet.read({ best: {}, levels: { 1: 3, 2: 1 } })).toEqual({ stars: 4, total: 36 });
  });

  test("an every-level achievement's goal is every level of the game", () => {
    const goal = (game: typeof ferry_game, id: string) => game.achievements.find((each) => each.id === id)?.goal;
    expect(goal(airport_game, "airport-levels")).toBe(Object.values(LEVEL_COUNTS).reduce((sum, count) => sum + count, 0));
    expect(goal(ferry_game, "ferry-levels")).toBe(FERRY_COUNT);
    expect(goal(forklift_game, "forklift-levels")).toBe(FORKLIFT_COUNT);
    expect(goal(mower_game, "mower-levels")).toBe(MOWER_COUNT);
    expect(goal(shunter_game, "shunter-levels")).toBe(SHUNTER_COUNT);
    expect(goal(rodeo_game, "rodeo-levels")).toBe(RODEO_COUNT);
    expect(goal(f1_game, "f1-levels")).toBe(F1_COUNT);
    expect(goal(test_game, "test-levels")).toBe(TEST_COUNT);
    expect(goal(valet_game, "valet-levels")).toBe(VALET_COUNT);
  });
});
