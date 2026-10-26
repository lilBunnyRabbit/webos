import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import { file_value } from "../files/shell";
import { format_bytes } from "$lib/core/utils";

// A lazy part: `clip ls` reads the system clipboard through core/components/clipboard, kept out of the boot chunk.
export function clip_shell(): ShellContribution {
  return {
    values: {
      clip: {
        columns: ["name", "type", "size"],
        cell: (value, column) => (column === "size" ? format_bytes(Number(value.size)) : String(value[column] ?? "")),
        text: (value) => `${String(value.name)}  ${String(value.type)}  (system clipboard)`,
      },
    },
    commands: [
      define_command({
        id: "clip ls",
        description: "What's on the clipboard: the system clipboard's item when the browser shows it, then files copied in WebOS",
        yields: "file",
        async *run() {
          const { clipboard_items, read_system } = await import("$lib/core/components/clipboard/paste");
          for (const item of await clipboard_items(await read_system())) {
            if (item.kind === "text") {
              yield { $type: "clip", name: item.text.split("\n")[0].slice(0, 80), type: "text", size: item.text.length };
            } else if (item.path === null) {
              yield { $type: "clip", name: item.file.name, type: item.file.type, size: item.file.size };
            } else {
              yield file_value(item.path, "file", item.file.size, item.file.lastModified);
            }
          }
        },
      }),
    ],
  };
}
