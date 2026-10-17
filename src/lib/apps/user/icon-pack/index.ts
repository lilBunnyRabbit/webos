import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { AppWindow as AppWindowIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "icon-pack",
  name: "Icon Pack",
  icon: AppWindowIcon,
  version: "1.0.0",
  description: "Turns an SVG or a large image into favicons, app icons and a social card, previewed where they land, zipped with the manifest and head tags.",
  keywords: ["favicon", "ico", "icon", "apple touch", "pwa", "manifest", "maskable", "og image", "social card", "web app"],
  category: AppCategory.MEDIA,
  tools: ["image/*", ".svg"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: {
    commands: [
      define_command({
        id: "icons",
        description: "Zip favicons, app icons, a social card, a manifest and head tags made from an SVG or image",
        args: z.object({
          path: arg.path(),
          bg: z
            .string()
            .regex(/^(#[0-9a-f]{6}|transparent)$/i)
            .optional()
            .describe("Background, #rrggbb or transparent; Apple and maskable icons use white when transparent"),
          padding: z.string().default("0%").describe("Space around the icon on each side, like 10%"),
          to: arg.path().optional().describe("Folder for the zip, next to the image by default"),
        }),
        positional: ["path"],
        yields: "file",
        complete: (field, partial, context) => (field === "path" ? logic().then((m) => m.complete_images(partial, context)) : undefined),
        run: async (context) => (await logic()).icons(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./icon-pack.app.svelte"),
});
