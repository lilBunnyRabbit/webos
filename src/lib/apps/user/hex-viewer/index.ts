import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export const offset = z.number().int().min(0);

export default define_app({
  id: "hex-viewer",
  name: "Hex Viewer",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Shows the raw bytes of any file, however large, as hex and ASCII side by side.",
  pitch: {
    problem: "Some files make no sense until you see their raw bytes.",
    solution: "View any file, however large, as hex and text side by side.",
  },
  keywords: [
    "hex",
    "binary",
    "bytes",
    "dump",
    "xxd",
    "hexdump",
    "inspect",
    "offset",
    "file",
    "magic",
    "entropy",
    "binwalk",
  ],
  props: z.object({ path: z.string().optional(), offset: offset.optional() }),
  tools: ["*"],
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 280 },
    },
  },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./hex-viewer.app.svelte"),
});
