import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import {
  FileImage as FileImageIcon,
  FilmStrip as FilmStripIcon,
  Ghost as GhostIcon,
  PaintBrush as PaintBrushIcon,
  Rabbit as RabbitIcon,
} from "phosphor-svelte";

export default define_app({
  id: "hopsprite",
  name: "Hopsprite",
  icon: RabbitIcon,
  version: "1.0.0",
  description: "Draw pixel art and animate it frame by frame, with layers, onion skin and SVG export.",
  keywords: ["pixel", "pixel art", "sprite", "animation", "frames", "onion skin", "8-bit", "palette", "tileset", "game assets", "svg", "draw"],
  category: AppCategory.MEDIA,
  associations: [".hopsprite"],
  tools: ["image/png", "image/gif", ".png", ".gif"],
  props: FILE_PROPS,
  highlights: [
    { icon: PaintBrushIcon, title: "Crisp pixel tools", text: "Pixel-perfect pencil, shapes, fill, dither and mirror drawing on an indexed palette." },
    { icon: FilmStripIcon, title: "Frame-by-frame animation", text: "A filmstrip of live thumbnails, with layers, per-frame timing, tags and loop or ping-pong playback." },
    { icon: GhostIcon, title: "Onion skin", text: "See the frames before and after as tinted ghosts while you draw." },
    { icon: FileImageIcon, title: "Vector export", text: "Export a frame or the whole animation as SVG that plays anywhere, even in an image tag." },
  ],
  defaults: { constraints: { width: { min: 360 }, height: { min: 420 } } },
  component: () => import("./hopsprite.app.svelte"),
});
