import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "hid-lab",
  name: "Keyboard & HID Lab",
  icon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  props: z.object({ section: z.enum(["keys", "hid"]).optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./hid-lab.app.svelte"),
});
