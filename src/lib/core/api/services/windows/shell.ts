import { z } from "zod";
import { view_transition } from "$lib/core/utils/view-transition";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type CommandContext, type ShellContribution, type Tagged, type Value } from "../shell/type";
import { is_tagged } from "../shell/values";
import { SnapZone, WindowFlag, type DesktopWindowsService, type MobileWindowsService, type WindowId, type WindowsService } from "./type";

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
const is_mobile = (windows: WindowsService): windows is MobileWindowsService => "go_home" in windows;

export function windows_shell(windows: WindowsService): ShellContribution {
  const focused = () => windows.get_focused();
  const any_open = () => windows.list().length > 0;

  /** Newest first, minimized ones included: they're still running. */
  const recent = () =>
    windows
      .sorted_list(([, a], [, b]) => b.order - a.order)
      .map(([id]) => id);

  function value(id: WindowId): WindowValue {
    const instance = windows.get(id)!;
    const state = windows.is_focused(id)
      ? "focused"
      : instance.flags.has(WindowFlag.MINIMIZED)
        ? "minimized"
        : instance.flags.has(WindowFlag.MAXIMIZED)
          ? "maximized"
          : "open";
    return { $type: "window", id, app: instance.app.id, title: instance.title ?? instance.app.manifest.name, state };
  }

  function find(typed: string): WindowId {
    const matches = windows.list().filter((id) => id.startsWith(typed));
    if (matches.length === 1) return matches[0];
    throw new ShellError(matches.length === 0 ? `no window ${typed}` : `${typed} matches ${matches.length} windows; type more of the id`);
  }

  /** Ids given, else the windows piped in, else (alone on the line) the focused one. */
  async function targets(given: string[], context: CommandContext<unknown>): Promise<WindowId[]> {
    if (given.length > 0) return given.map(find);
    if (!context.piped) {
      const id = focused();
      if (!id) throw new ShellError("no window is focused");
      return [id];
    }
    const ids: WindowId[] = [];
    for await (const item of context.input) {
      if (is_window_value(item) && windows.exists(item.id)) ids.push(item.id);
      else if (typeof item === "string") ids.push(find(item));
    }
    return ids;
  }

  function bring(id: WindowId | undefined) {
    if (!id) return;
    if (windows.get(id)?.flags.has(WindowFlag.MINIMIZED)) view_transition(() => windows.toggle_minimize(id));
    else windows.focus(id);
  }

  const ids = z.array(arg.window()).default([]).describe("Window ids, or the windows piped in; the focused one by default");

  const commands = [
    define_command({
      id: "win list",
      description: "Open windows, newest first",
      yields: "window",
      *run() {
        for (const id of recent()) yield value(id);
      },
    }),
    define_command({
      id: "win close",
      description: "Close windows",
      args: z.object({ ids, all: z.boolean().default(false).describe("Every window") }),
      positional: ["ids"],
      short: { all: "a" },
      available: any_open,
      async run(context) {
        if (context.args.all) {
          await windows.close_all();
          return;
        }
        for (const id of await targets(context.args.ids, context)) {
          const instance = windows.get(id);
          if (instance?.flags.has(WindowFlag.MAXIMIZED) && !instance.dirty) view_transition(() => void windows.close(id));
          else await windows.close(id);
        }
      },
    }),
    define_command({
      id: "win focus",
      description: "Bring a window forward",
      args: z.object({ id: arg.window() }),
      positional: ["id"],
      available: any_open,
      run: ({ args }) => bring(find(args.id)),
    }),
    define_command({
      id: "win minimize",
      description: is_mobile(windows) ? "Go home" : "Minimize or restore windows",
      args: z.object({ ids }),
      positional: ["ids"],
      available: any_open,
      async run(context) {
        const list = await targets(context.args.ids, context);
        view_transition(() => {
          for (const id of list) windows.toggle_minimize(id);
        });
      },
    }),
    define_command({
      id: "win previous",
      description: "Switch to the previous window",
      available: () => windows.list().length > 1 || (focused() === null && any_open()),
      // From home nothing is focused, so the newest window is the one to bring back.
      run: () => bring(focused() ? recent()[1] : recent()[0]),
    }),
    define_command({
      id: "win cycle",
      description: "Cycle through windows",
      available: () => windows.list().length > 1,
      run: () => bring(recent().at(-1)),
    }),
    define_command({
      id: "win desktop",
      description: is_mobile(windows) ? "Go home" : "Show the desktop",
      run: () =>
        view_transition(() => {
          if (is_mobile(windows)) return windows.go_home();
          for (const id of windows.list()) {
            if (!windows.get(id)?.flags.has(WindowFlag.MINIMIZED)) windows.toggle_minimize(id);
          }
        }),
    }),
  ];

  if (is_desktop(windows)) {
    const desktop = windows;
    const zones = [SnapZone.LEFT, SnapZone.RIGHT, SnapZone.TOP, SnapZone.BOTTOM, SnapZone.TOP_LEFT, SnapZone.TOP_RIGHT, SnapZone.BOTTOM_LEFT, SnapZone.BOTTOM_RIGHT] as const;
    commands.push(
      define_command({
        id: "win maximize",
        description: "Maximize or restore windows",
        args: z.object({ ids }),
        positional: ["ids"],
        available: any_open,
        async run(context) {
          const list = await targets(context.args.ids, context);
          view_transition(() => {
            for (const id of list) desktop.toggle_maximize(id);
          });
        },
      }),
      define_command({
        id: "win snap",
        description: "Snap a window to an edge or corner; the same zone again unsnaps",
        args: z.object({ zone: z.enum([...zones, "none"]), id: arg.window().optional() }),
        positional: ["zone", "id"],
        available: any_open,
        run({ args }) {
          const id = args.id ? find(args.id) : focused();
          if (!id) throw new ShellError("no window is focused");
          view_transition(() => {
            const instance = desktop.get(id);
            // Maximize wins when rendering, so a snap from maximized has to leave it first.
            if (instance?.flags.has(WindowFlag.MAXIMIZED)) desktop.toggle_maximize(id);
            const zone = args.zone === "none" || instance?.snap_zone === args.zone ? null : args.zone;
            desktop.snap(id, zone);
          });
        },
      }),
      define_command({
        id: "win gather",
        description: "Gather windows on screen",
        available: any_open,
        run: () => view_transition(() => desktop.gather()),
      })
    );
  }

  return {
    commands,
    completers: {
      [ArgKind.WINDOW]: () =>
        recent().map((id) => {
          const window = value(id);
          return { value: short_id(id), detail: `${window.title} (${window.app})` };
        }),
    },
    values: {
      window: {
        columns: ["id", "app", "title", "state"],
        cell: (window, column) => (column === "id" ? short_id(String(window.id)) : String(window[column] ?? "")),
        text: (window) => `${short_id(String(window.id))}  ${String(window.title)}  ${String(window.state)}`,
        open: (window) => {
          if (windows.exists(String(window.id))) bring(String(window.id));
        },
      },
    },
  };
}

function is_window_value(value: Value): value is WindowValue {
  return is_tagged(value) && value.$type === "window" && typeof value.id === "string";
}
