import { z } from "zod";
import { arg } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import { assert_writable, file_value, is_file_value } from "../files/shell";
import { resolve_path } from "../files/path";
import { format_bytes } from "$lib/core/utils";
import type { ClipboardService } from "./type";

const paste = () => import("$lib/core/components/clipboard/paste");

export function clipboard_shell(clipboard: ClipboardService): ShellContribution {
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
        id: "copy",
        description: "Copy text to the system clipboard, or piped files to the WebOS clipboard",
        args: z.object({ text: z.array(z.string()).default([]) }),
        positional: ["text"],
        async run({ args, input, piped }) {
          if (args.text.length > 0 || !piped) {
            await clipboard.copy_text(args.text.join(" "));
            return;
          }
          const paths: string[] = [];
          const lines: string[] = [];
          for await (const item of input) {
            if (is_file_value(item)) paths.push(item.path);
            else lines.push(typeof item === "string" ? item : JSON.stringify(item));
          }
          if (paths.length > 0) clipboard.copy_files(paths);
          if (lines.length > 0) await clipboard.copy_text(lines.join("\n"));
        },
      }),
      define_command({
        id: "clip ls",
        description: "What's on the clipboard: the system clipboard's item when the browser shows it, then files copied in WebOS",
        yields: "file",
        async *run() {
          const { clipboard_items, read_system } = await paste();
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
      define_command({
        id: "paste",
        description: "Paste copied files here, or into a folder",
        args: z.object({ target: arg.path().optional() }),
        positional: ["target"],
        yields: "file",
        async *run({ args, session, elevated }) {
          if (!clipboard.content) throw new ShellError("paste: no files copied");
          const target = resolve_path(session.cwd, args.target ?? ".");
          assert_writable(target, elevated);
          for (const path of await clipboard.paste_files(target, async () => "keep_both")) yield file_value(path, "file");
        },
      }),
    ],
  };
}
