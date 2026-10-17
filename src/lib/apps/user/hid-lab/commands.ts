import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
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
} satisfies ShellContribution;
