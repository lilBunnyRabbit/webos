import {
  Briefcase as BriefcaseIcon,
  Code as CodeIcon,
  FilmStrip as FilmStripIcon,
  GameController as GameControllerIcon,
  GearSix as GearSixIcon,
  SquaresFour as SquaresFourIcon,
  Wrench as WrenchIcon,
} from "phosphor-svelte";
import { LibraryCategory } from "./library";

export const CATEGORY_ICONS = {
  [LibraryCategory.ALL]: SquaresFourIcon,
  [LibraryCategory.PRODUCTIVITY]: BriefcaseIcon,
  [LibraryCategory.MEDIA]: FilmStripIcon,
  [LibraryCategory.UTILITIES]: WrenchIcon,
  [LibraryCategory.DEVELOPER]: CodeIcon,
  [LibraryCategory.GAMES]: GameControllerIcon,
  [LibraryCategory.SYSTEM]: GearSixIcon,
};
