import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "hid-lab",
  name: "Keyboard & HID Lab",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  props: z.object({ section: z.enum(["keys", "hid"]).optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./hid-lab.app.svelte"),
});
