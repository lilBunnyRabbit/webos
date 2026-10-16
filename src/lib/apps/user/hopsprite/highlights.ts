import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  FileImage as FileImageIcon,
  FilmStrip as FilmStripIcon,
  Ghost as GhostIcon,
  PaintBrush as PaintBrushIcon,
} from "phosphor-svelte";

export default [
  { icon: PaintBrushIcon, title: "Crisp pixel tools", text: "Pixel-perfect pencil, shapes, fill, dither and mirror drawing on an indexed palette." },
  { icon: FilmStripIcon, title: "Frame-by-frame animation", text: "A filmstrip of live thumbnails, with layers, per-frame timing, tags and loop or ping-pong playback." },
  { icon: GhostIcon, title: "Onion skin", text: "See the frames before and after as tinted ghosts while you draw." },
  { icon: FileImageIcon, title: "Vector export", text: "Export a frame or the whole animation as SVG that plays anywhere, even in an image tag." },
] satisfies AppHighlight[];
