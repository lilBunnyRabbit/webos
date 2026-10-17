import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Broom as BroomIcon, MapPin as MapPinIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: MapPinIcon, title: "What a photo gives away", text: "Camera, lens, settings, the time it was taken and where, on a map." },
  { icon: BroomIcon, title: "Strip and save", text: "Save a clean copy without the metadata; the pixels stay exactly as they were." },
  { icon: TerminalIcon, title: "meta", text: "List metadata for many files in the Terminal, filter by camera or location, strip them in one go." },
] satisfies AppHighlight[];
