import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Eye as EyeIcon, FolderOpen as FolderOpenIcon, Lightbulb as LightbulbIcon, Package as PackageIcon } from "phosphor-svelte";

export default [
  { icon: FolderOpenIcon, title: "Browse and extract", text: "Look inside a zip and extract it into a folder of its own." },
  { icon: EyeIcon, title: "Quick preview", text: "Peek at text and images inside a zip without extracting anything." },
  { icon: PackageIcon, title: "Create zips", text: "Pack files and folders into a zip, compressed or just bundled." },
  { icon: LightbulbIcon, title: "How it works", text: "Type some text and watch compression find the repeats and shrink it." },
] satisfies AppHighlight[];
