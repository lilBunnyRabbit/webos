import { z } from "zod";
import { arg } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import type { WindowsService } from "../windows/type";
import type { ExtractService } from "./type";

export function extract_shell(extract: ExtractService, windows: WindowsService): ShellContribution {
  return {
    commands: [
      define_command({
        id: "win pop",
        description: "Pop a window out into a mini window that stays on top",
        args: z.object({ id: arg.window().optional().describe("Window id; the focused one by default") }),
        positional: ["id"],
        available: () => extract.supported && windows.list().length > 0,
        run: async ({ args }) => {
          const matches = args.id ? windows.list().filter((id) => id.startsWith(args.id!)) : [windows.get_focused()].filter((id) => id !== null);
          if (matches.length !== 1) throw new ShellError(args.id ? `no single window ${args.id}` : "no window is focused");
          const id = matches[0];
          if (windows.get(id)?.dirty) throw new ShellError("save the window first: popping out reloads the app");
          const out = extract.current ? windows.get(extract.current) : null;
          if (out?.dirty && extract.current !== id) {
            await extract.pop(id);
            return;
          }
          if (!(await extract.pop(id))) throw new ShellError("the browser didn't open the mini window");
        },
      }),
      define_command({
        id: "win back",
        description: "Bring the popped-out window back",
        available: () => extract.current !== null,
        run: async () => void (await extract.bring_back()),
      }),
    ],
  };
}
