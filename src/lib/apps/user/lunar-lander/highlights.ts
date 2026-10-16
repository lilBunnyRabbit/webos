import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Planet as PlanetIcon, RocketLaunch as RocketLaunchIcon, Target as TargetIcon } from "phosphor-svelte";

export default [
  { icon: RocketLaunchIcon, title: "Three ships", text: "A lander, twin pods and a heavy shuttle, each flown by its own engines." },
  { icon: PlanetIcon, title: "Pick the planet", text: "Zero-G, Moon, Mars or Earth, with air and wind if you want them." },
  { icon: TargetIcon, title: "Land it", text: "Set down slow and level on the pad, before the fuel runs out." },
] satisfies AppHighlight[];
