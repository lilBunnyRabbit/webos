import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Keyboard as KeyboardIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "hid-lab",
  name: "Keyboard & HID Lab",
  icon: KeyboardIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Test every key of a keyboard with timing, rollover and a layout heatmap, and inspect USB HID devices and their report descriptors.",
  keywords: ["keyboard", "key", "tester", "keycode", "rollover", "ghosting", "nkro", "hid", "webhid", "usb", "descriptor", "gamepad", "report"],
  props: z.object({ section: z.enum(["keys", "hid"]).optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 400 } } },
  shell: {
    values: {
      "hid-device": {
        columns: ["name", "ids", "usage", "collections", "opened"],
        text: (value) => `${value.name}  ${value.ids}  ${value.usage}`,
        open: () => void logic().then((m) => m.open()),
      },
    },
    commands: [
      define_command({
        id: "hid ls",
        description: "HID devices this site may use; click one to open Keyboard & HID Lab",
        yields: "hid-device",
        available: () => "hid" in navigator || "WebHID isn't available in this browser",
        run: async () => (await logic()).ls(),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./hid-lab.app.svelte"),
});
