import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  ArrowsIn as ArrowsInIcon,
  ArrowsInSimple as ArrowsInSimpleIcon,
  Bandaids as BandaidsIcon,
  Crop as CropIcon,
  Eraser as EraserIcon,
  EyeSlash as EyeSlashIcon,
  FilmStrip as FilmStripIcon,
  Printer as PrinterIcon,
  SquareHalf as SquareHalfIcon,
  Stack as StackIcon,
  Swap as SwapIcon,
} from "phosphor-svelte";

export default [
  { icon: EraserIcon, title: "Remove background", text: "Pick the colours to drop and get a transparent copy." },
  { icon: StackIcon, title: "Join images", text: "Stack images or line them up side by side, with gaps and a background." },
  { icon: CropIcon, title: "Trim and split", text: "Trim away transparent borders, or cut an image into square tiles." },
  { icon: FilmStripIcon, title: "Sprite sheets", text: "Slice a sheet into frames and preview the animation, or pack frames into an atlas." },
  { icon: BandaidsIcon, title: "Patch", text: "Lay the original under an edited copy and paint back the parts an editor stamped over." },
  { icon: EyeSlashIcon, title: "Redact", text: "Cover names and faces with a box, pixels or a heavy blur, and save a copy without metadata." },
  { icon: ArrowsInIcon, title: "Squash", text: "Save smaller WebP or JPEG copies of many images at once and see what each one saves." },
  { icon: ArrowsInSimpleIcon, title: "Fit under a size", text: "Get a picture under an upload limit, keeping as much quality as it can." },
  { icon: SwapIcon, title: "Convert", text: "Turn one picture into every format at once, from AVIF and JPEG XL to ICO and TIFF, and see which is smallest." },
  { icon: SquareHalfIcon, title: "Compare", text: "Wipe or fade between two versions of a picture, or see exactly what changed." },
  { icon: PrinterIcon, title: "Poster print", text: "Print one image across several sheets, with crop marks and a map for putting it together." },
] satisfies AppHighlight[];
