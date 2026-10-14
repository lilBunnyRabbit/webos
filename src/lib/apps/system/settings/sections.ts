import {
  FileText as FileTextIcon,
  Info as InfoIcon,
  MapTrifold as MapTrifoldIcon,
  Palette as PaletteIcon,
  Sparkle as SparkleIcon,
  SquareSplitVertical as SquareSplitVerticalIcon,
} from "phosphor-svelte";

export const SECTIONS = [
  { value: "appearance", label: "Appearance", icon: PaletteIcon },
  { value: "taskbar", label: "Taskbar", icon: SquareSplitVerticalIcon },
  { value: "files", label: "Default apps", icon: FileTextIcon },
  { value: "whats-new", label: "What's new", icon: SparkleIcon },
  { value: "roadmap", label: "Roadmap", icon: MapTrifoldIcon },
  { value: "about", label: "About", icon: InfoIcon },
] as const;

export type Section = (typeof SECTIONS)[number]["value"];

export const SECTION_IDS = SECTIONS.map((item) => item.value);
