import type { Achievement } from "$lib/core/api/services/achievements/definition";
import type { Component, Snippet } from "svelte";
import type { DriveSettings } from "../core/settings.svelte";

export const Building = { CAR_PARK: "car-park" } as const;
export type Building = (typeof Building)[keyof typeof Building];

export interface GameProps {
  settings: DriveSettings;
  /** The day of a daily the app was opened with; a game without dailies ignores it. */
  daily?: string;
  menu?: Snippet;
  /** Back to the yard. Without it Back leaves the app once the game has nothing of its own to close. */
  onexit?: () => void;
}

export interface GameDefinition {
  id: string;
  name: string;
  icon: Component;
  building: Building;
  /** Merged into the app's achievements; ids stay unique across games. */
  achievements: Achievement[];
  load: () => Promise<{ default: Component<GameProps> }>;
}

export function define_game(definition: GameDefinition): GameDefinition {
  return definition;
}
