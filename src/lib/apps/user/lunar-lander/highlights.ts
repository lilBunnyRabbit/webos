import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Planet as PlanetIcon, RocketLaunch as RocketLaunchIcon, Target as TargetIcon } from "phosphor-svelte";

export default [
  { icon: RocketLaunchIcon, title: "Three ships, three feels", text: "A nimble lander on RCS thrusters, twin pods that turn by splitting their thrust, and a 12 t shuttle slow to spool and to turn." },
  { icon: PlanetIcon, title: "Real gravity", text: "The Moon, Mars with thin air and gusts, and Earth with six times the pull. The lever's Hover notch holds you still on each." },
  { icon: TargetIcon, title: "Missions", text: "Pads in craters, on ridges and inside caves, cargo that makes the ship heavier, and three stars: down, gentle, under par." },
] satisfies AppHighlight[];
