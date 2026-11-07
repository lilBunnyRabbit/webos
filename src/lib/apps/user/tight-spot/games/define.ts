import type { Achievement } from "$lib/core/api/services/achievements/definition";
import type { PlayTracker } from "$kit/games";
import type { IconComponentProps } from "phosphor-svelte";
import type { Component, Snippet } from "svelte";
import type { Prefs } from "../core/prefs";
import type { Progress } from "../core/track";
import type { DriveSettings } from "../core/settings.svelte";

export const Building = {
  CAR_PARK: "car-park",
  WAREHOUSE: "warehouse",
  VALET_STAND: "valet-stand",
  APRON: "apron",
  FERRY: "ferry",
  GARDEN: "garden",
  ARENA: "arena",
  TRACK: "track",
  TEST_CENTRE: "test-centre",
  FREIGHT_YARD: "freight-yard",
} as const;
export type Building = (typeof Building)[keyof typeof Building];

export interface GameProps {
  settings: DriveSettings;
  /** `storage.json`, read before the game mounts. */
  prefs: Prefs;
  /** The day of a daily the app was opened with; a game without dailies ignores it. */
  daily?: string;
  menu?: Snippet;
  /** The window's Game Hub tracker, owned by the shell; a game reports its daily results through it. */
  play: PlayTracker;
  /** Back to the yard. Without it Back leaves the app once the game has nothing of its own to close. */
  onexit?: () => void;
}

export interface ProgressSource {
  /** The game's save in the app's data folder, `/var/lib/apps/tight-spot/{file}`. */
  file: string;
  /** Stars earned out of the total from that save, as read from disk (`null` when there is none): never throws. */
  read(save: unknown): Progress;
}

export interface GameDefinition {
  id: string;
  name: string;
  icon: Component<IconComponentProps>;
  building: Building;
  /** Merged into the app's achievements; ids stay unique across games. */
  achievements: Achievement[];
  load: () => Promise<{ default: Component<GameProps> }>;
  /** Its level track's stars, for the doorway sign and the licence card; a small lazy module, so the yard loads none of the game. */
  progress?: () => Promise<ProgressSource>;
}

export function define_game(definition: GameDefinition): GameDefinition {
  return definition;
}
