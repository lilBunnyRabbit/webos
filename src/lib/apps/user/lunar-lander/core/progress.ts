import { best_schema, progress_schema_of } from "$kit/games/play2d/progress";
import { z } from "zod";
import { BODY_IDS, BodyId } from "./bodies";
import { MISSIONS } from "./missions";
import { SHIP_IDS, ShipId } from "./ships";

export { better, PROGRESS_FILE } from "$kit/games/play2d/progress";
export const SETTINGS_FILE = "settings.json";

export const progress_schema = progress_schema_of(best_schema).extend({
  landings: z.number().int().nonnegative().catch(0),
  ships_landed: z.array(z.enum(SHIP_IDS)).catch([]),
});
export type Progress = z.infer<typeof progress_schema>;

export const DEFAULT_PROGRESS: Progress = { version: 1, bests: {}, landings: 0, ships_landed: [] };

export const settings_schema = z.object({
  ship: z.enum(SHIP_IDS).catch(ShipId.LANDER),
  body: z.enum(BODY_IDS).catch(BodyId.MOON),
  air: z.boolean().catch(true),
  wind: z.boolean().catch(false),
  infinite_fuel: z.boolean().catch(false),
  sound: z.boolean().catch(true),
  seen_hint: z.boolean().catch(false),
});
export type Settings = z.infer<typeof settings_schema>;

export const DEFAULT_SETTINGS: Settings = { ship: ShipId.LANDER, body: BodyId.MOON, air: true, wind: false, infinite_fuel: false, sound: true, seen_hint: false };

export function done(bests: Progress["bests"], n: number): boolean {
  return !!bests[`level-${n}`];
}

export function missions_done(bests: Progress["bests"]): number {
  return MISSIONS.filter((mission) => done(bests, mission.n)).length;
}

/** The campaign is linear: a mission opens once the one before it is done. */
export function is_open(bests: Progress["bests"], n: number): boolean {
  return n === 1 || done(bests, n - 1) || done(bests, n);
}

/** The lander from the start; every other ship once a mission flown in it is done. */
export function unlocked_ships(bests: Progress["bests"]): ShipId[] {
  return SHIP_IDS.filter((ship) => ship === ShipId.LANDER || MISSIONS.some((mission) => mission.ship === ship && done(bests, mission.n)));
}
