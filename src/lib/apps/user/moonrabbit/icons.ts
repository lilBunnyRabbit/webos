import type { Component } from "svelte";
import {
  Airplane,
  Barbell,
  BookOpen,
  Briefcase,
  Broom,
  Code,
  Coffee,
  CookingPot,
  Couch,
  Dog,
  FilmSlate,
  GameController,
  GraduationCap,
  Heart,
  Moon,
  MusicNotes,
  Palette,
  PersonSimpleRun,
  PersonSimpleWalk,
  Pill,
  ShoppingCart,
  Smiley,
  SmileyMeh,
  SmileySad,
  SmileyWink,
  SmileyXEyes,
  Sparkle,
  Sun,
  Tree,
  Users,
  UsersThree,
} from "phosphor-svelte";
import type { IconName } from "./activities";
import type { Mood } from "./mood";

export const MOOD_ICONS: Record<Mood, Component> = {
  1: SmileyXEyes,
  2: SmileySad,
  3: SmileyMeh,
  4: Smiley,
  5: SmileyWink,
};

export const ACTIVITY_ICONS: Record<IconName, Component> = {
  work: Briefcase,
  exercise: Barbell,
  walk: PersonSimpleWalk,
  run: PersonSimpleRun,
  friends: UsersThree,
  family: Users,
  partner: Heart,
  reading: BookOpen,
  gaming: GameController,
  cooking: CookingPot,
  music: MusicNotes,
  movies: FilmSlate,
  chores: Broom,
  learning: GraduationCap,
  relax: Couch,
  travel: Airplane,
  shopping: ShoppingCart,
  nature: Tree,
  sick: Pill,
  pet: Dog,
  art: Palette,
  coding: Code,
  coffee: Coffee,
  sleep: Moon,
  sun: Sun,
  star: Sparkle,
};

export function activity_icon(name: string): Component {
  return name in ACTIVITY_ICONS ? ACTIVITY_ICONS[name as IconName] : Sparkle;
}

/** Low days lean `secondary`, good days `primary`; a day written without a mood is an outline, so it never reads as "okay". */
export function mood_fill(mood: number | null | undefined, written: boolean): string {
  if (mood === null || mood === undefined)
    return written ? "bg-foreground/6 ring-1 ring-inset ring-foreground/40" : "bg-foreground/6";
  const level = Math.min(5, Math.max(1, Math.round(mood)));
  return [
    "bg-secondary text-background",
    "bg-secondary/45",
    "bg-foreground/30",
    "bg-primary/45",
    "bg-primary text-background",
  ][level - 1];
}
