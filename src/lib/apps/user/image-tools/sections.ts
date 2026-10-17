import type { Snippet } from "svelte";

export const Section = {
  REMOVE_BACKGROUND: "remove-background",
  JOIN: "join",
  TRIM: "trim",
  SPLIT: "split",
  SPRITES: "sprites",
  TEST_IMAGE: "test-image",
} as const;
export type Section = (typeof Section)[keyof typeof Section];

export const SECTION_IDS = Object.values(Section) as [Section, ...Section[]];

export interface LaunchProps {
  section?: Section;
  path?: string;
  paths?: string[];
}

export interface SectionProps {
  picker: Snippet;
  initial_paths: string[];
  /** Hidden sections stay mounted, so document-level handlers check this. */
  active: boolean;
}

/** One image, or none, opens Remove background: unlike Trim, Split or Sprites it does something to any image. */
export function initial_section(props: LaunchProps): Section {
  if (props.section) return props.section;
  return launch_paths(props).length > 1 ? Section.JOIN : Section.REMOVE_BACKGROUND;
}

export function launch_paths(props: LaunchProps): string[] {
  return [...(props.path ? [props.path] : []), ...(props.paths ?? [])];
}
