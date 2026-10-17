import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Binary as BinaryIcon } from "phosphor-svelte";
import { z } from "zod";

export const offset = z.number().int().min(0);

export default define_app({
  id: "hex-viewer",
  name: "Hex Viewer",
  icon: BinaryIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Shows the raw bytes of any file, however large, as hex and ASCII side by side.",
  keywords: ["hex", "binary", "bytes", "dump", "xxd", "hexdump", "inspect", "offset", "file", "magic", "entropy", "binwalk"],
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
