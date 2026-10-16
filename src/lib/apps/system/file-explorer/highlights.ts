import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  ArrowsDownUp as ArrowsDownUpIcon,
  FileZip as FileZipIcon,
  HardDrives as HardDrivesIcon,
  TerminalWindow as TerminalWindowIcon,
} from "phosphor-svelte";

export default [
  { icon: ArrowsDownUpIcon, title: "Drag and drop", text: "Drag files between folders, or drop them in from your device." },
  { icon: HardDrivesIcon, title: "Device files", text: "Upload files from your device and save any of them back to disk." },
  { icon: FileZipIcon, title: "Zip in place", text: "Compress a selection into a zip, or extract one right where it is." },
  { icon: TerminalWindowIcon, title: "Open in Terminal", text: "Jump into a Terminal already sitting in the folder you're looking at." },
] satisfies AppHighlight[];
