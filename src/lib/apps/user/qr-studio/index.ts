import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "qr-studio",
  name: "QR Studio",
  icon: AppIcon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  props: z.object({ text: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./qr-studio.app.svelte"),
});
