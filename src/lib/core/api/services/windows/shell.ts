import { z } from "zod";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import type { ShellContribution, Tagged } from "../shell/type";
import {
  SnapZone,
  type DesktopWindowsService,
  type MobileWindowsService,
  type WindowId,
  type WindowsService,
} from "./type";

export interface WindowValue extends Tagged {
  $type: "window";
  id: WindowId;
  app: string;
  title: string;
  state: "focused" | "minimized" | "maximized" | "open";
}

/** Window ids are UUIDs; the shell shows and accepts the first eight characters. */
export const short_id = (id: WindowId) => id.slice(0, 8);

const is_desktop = (windows: WindowsService): windows is DesktopWindowsService => "snap" in windows;
export const is_mobile = (windows: WindowsService): windows is MobileWindowsService => "go_home" in windows;

const logic = () => import("./shell-run");

export function windows_shell(windows: WindowsService): ShellContribution {
  const focused = () => windows.get_focused();
  const any_open = () => windows.list().length > 0;

  const ids = z
    .array(arg.window())
    .default([])
    .describe("Window ids, or the windows piped in; the focused one by default");

  const commands = [
    define_command({
      id: "win list",
      description: "Open windows, newest first",
      yields: "window",
      async *run() {
        yield* (await logic()).list(windows);
      },
    }),
    define_command({
      id: "win close",
      description: "Close windows",
      args: z.object({ ids, all: z.boolean().default(false).describe("Every window") }),
      positional: ["ids"],
      short: { all: "a" },
      available: any_open,
      run: async (context) => (await logic()).close(windows, context),
    }),
    define_command({
      id: "win focus",
      description: "Bring a window forward",
      args: z.object({ id: arg.window() }),
      positional: ["id"],
      available: any_open,
      run: async ({ args }) => (await logic()).focus(windows, args.id),
    }),
    define_command({
      id: "win minimize",
      description: is_mobile(windows) ? "Go home" : "Minimize or restore windows",
      args: z.object({ ids }),
      positional: ["ids"],
      available: any_open,
      run: async (context) => (await logic()).minimize(windows, context),
    }),
    define_command({
      id: "win previous",
      description: "Switch to the previous window",
      available: () => windows.list().length > 1 || (focused() === null && any_open()),
      run: async () => (await logic()).previous(windows),
    }),
    define_command({
      id: "win cycle",
      description: "Cycle through windows",
      available: () => windows.list().length > 1,
      run: async () => (await logic()).cycle(windows),
    }),
    define_command({
      id: "win desktop",
      description: is_mobile(windows) ? "Go home" : "Show the desktop",
      run: async () => (await logic()).show_desktop(windows),
    }),
  ];

  if (is_desktop(windows)) {
    const desktop = windows;
    const zones = [
      SnapZone.LEFT,
      SnapZone.RIGHT,
      SnapZone.TOP,
      SnapZone.BOTTOM,
      SnapZone.TOP_LEFT,
      SnapZone.TOP_RIGHT,
      SnapZone.BOTTOM_LEFT,
      SnapZone.BOTTOM_RIGHT,
    ] as const;
    commands.push(
      define_command({
        id: "win maximize",
        description: "Maximize or restore windows",
        args: z.object({ ids }),
        positional: ["ids"],
        available: any_open,
        run: async (context) => (await logic()).maximize(desktop, context),
      }),
      define_command({
        id: "win snap",
        description: "Snap a window to an edge or corner; the same zone again unsnaps",
        args: z.object({ zone: z.enum([...zones, "none"]), id: arg.window().optional() }),
        positional: ["zone", "id"],
        available: any_open,
        run: async ({ args }) => (await logic()).snap(desktop, args),
      }),
      define_command({
        id: "win gather",
        description: "Gather windows on screen",
        available: any_open,
        run: async () => (await logic()).gather(desktop),
      })
    );
  }

  return {
    commands,
    completers: {
      [ArgKind.WINDOW]: async () => (await logic()).complete_window(windows),
    },
    values: {
      window: {
        columns: ["id", "app", "title", "state"],
        cell: (window, column) => (column === "id" ? short_id(String(window.id)) : String(window[column] ?? "")),
        text: (window) => `${short_id(String(window.id))}  ${String(window.title)}  ${String(window.state)}`,
        open: (window) => {
          if (windows.exists(String(window.id))) void logic().then((m) => m.bring(windows, String(window.id)));
        },
      },
    },
  };
}
