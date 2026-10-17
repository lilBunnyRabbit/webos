import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  FlagCheckered as FlagCheckeredIcon,
  ListNumbers as ListNumbersIcon,
  TreeStructure as TreeStructureIcon,
  Trophy as TrophyIcon,
} from "phosphor-svelte";

export default [
  { icon: TreeStructureIcon, title: "Knockout brackets", text: "Single or double elimination, seeded, with byes when the numbers don't add up." },
  { icon: ListNumbersIcon, title: "Round robin", text: "Everyone plays everyone, with a live table of wins, draws, losses and points." },
  { icon: FlagCheckeredIcon, title: "Race cups", text: "Enter each race's finishing order and the points add up, in groups when there are many players." },
  { icon: TrophyIcon, title: "A file per tournament", text: "Each bracket is a .bracket file in Documents, saved as you go." },
] satisfies AppHighlight[];
