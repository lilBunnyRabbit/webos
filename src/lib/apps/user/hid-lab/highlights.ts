import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Keyboard as KeyboardIcon, ListMagnifyingGlass as ListMagnifyingGlassIcon, Terminal as TerminalIcon, Usb as UsbIcon } from "phosphor-svelte";

export default [
  { icon: KeyboardIcon, title: "Key tester", text: "Every key's key, code, location and timing, held keys and rollover, and a heatmap of the keys you've tested." },
  { icon: UsbIcon, title: "WebHID inspector", text: "Connect a USB or Bluetooth HID device, see its collections and watch its input reports decoded live." },
  { icon: ListMagnifyingGlassIcon, title: "Descriptor parser", text: "Paste a HID report descriptor and read it item by item, with usage names and report sizes." },
  { icon: TerminalIcon, title: "hid ls", text: "List the HID devices this site may use from the Terminal." },
] satisfies AppHighlight[];
