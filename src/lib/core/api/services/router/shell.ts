import { z } from "zod";
import { arg } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import type { WindowsService } from "../windows/type";
import type { RouterService } from "./type";
import { RouteKind } from "./route";

export function router_shell(router: RouterService, windows: () => WindowsService): ShellContribution {
  return {
    commands: [
      define_command({
        id: "link",
        description: "A link that opens a window's app as it is now",
        args: z.object({
          id: arg.window().optional(),
          copy: z.boolean().default(false).describe("Copy it too"),
          solo: z.boolean().default(false).describe("Opens only the app, full page, without the desktop"),
        }),
        positional: ["id"],
        short: { copy: "c", solo: "s" },
        async run({ args }) {
          const id = args.id ? windows().list().find((candidate) => candidate.startsWith(args.id!)) : windows().get_focused();
          if (!id) throw new ShellError(args.id ? `no window ${args.id}` : "no window is focused");
          const kind = args.solo ? RouteKind.SOLO : RouteKind.APP;
          const link = router.link_for(id, kind);
          if (!link) throw new ShellError("this window can't be shared as a link");
          if (args.copy) await router.copy_link(id, kind);
          return link;
        },
      }),
    ],
  };
}
