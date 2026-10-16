import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Archive as ArchiveIcon, FileText as FileTextIcon, Image as ImageIcon, Palette as PaletteIcon } from "phosphor-svelte";

export default [
  { icon: PaletteIcon, title: "Themes", text: "Pick a preset theme or tune every colour yourself." },
  { icon: ImageIcon, title: "Wallpaper", text: "Set any image as wallpaper, with fit, dim and blur." },
  { icon: FileTextIcon, title: "Default apps", text: "See which app always opens each kind of file, and forget a choice." },
  { icon: ArchiveIcon, title: "Backup", text: "Save your files and settings to a zip on your device and restore them later." },
] satisfies AppHighlight[];
