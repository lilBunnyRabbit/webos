import type { AppMeta } from "$lib/core/api";

export default {
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
  pitch: {
    problem: "You can't tell whether a keyboard key misfires or ghosts.",
    solution: "Test every key with timing, rollover and a heatmap, and inspect USB HID devices.",
  },
} satisfies AppMeta;
