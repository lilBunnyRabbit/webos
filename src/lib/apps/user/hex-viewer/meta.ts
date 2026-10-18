import type { AppMeta } from "$lib/core/api";

export default {
  description: "Shows the raw bytes of any file, however large, as hex and ASCII side by side.",
  keywords: [
    "hex",
    "binary",
    "bytes",
    "dump",
    "xxd",
    "hexdump",
    "inspect",
    "offset",
    "file",
    "magic",
    "entropy",
    "binwalk",
  ],
  pitch: {
    problem: "Some files make no sense until you see their raw bytes.",
    solution: "View any file, however large, as hex and text side by side.",
  },
} satisfies AppMeta;
