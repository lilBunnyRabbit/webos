import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "hid-lab",
  name: "Keyboard & HID Lab",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description:
    "Test every key of a keyboard with timing, rollover and a layout heatmap, and inspect USB HID devices and their report descriptors.",
  keywords: [
    "keyboard",
    "key",
    "tester",
    "keycode",
    "rollover",
    "ghosting",
    "nkro",
    "hid",
    "webhid",
    "usb",
    "descriptor",
    "gamepad",
    "report",
  ],
  props: z.object({ section: z.enum(["keys", "hid"]).optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./hid-lab.app.svelte"),
});
