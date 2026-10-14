import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { MusicNotes as MusicNotesIcon } from "phosphor-svelte";

export default define_app({
  id: "soundboard",
  name: "Soundboard",
  icon: MusicNotesIcon,
  version: "1.0.0",
  description: "A grid of pads that play your own sounds, by click or key.",
  keywords: ["sound", "audio", "pads", "sfx", "effects", "board"],
  category: AppCategory.MEDIA,
  tools: ["audio/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 280 },
    },
  },
  component: () => import("./soundboard.app.svelte"),
});
