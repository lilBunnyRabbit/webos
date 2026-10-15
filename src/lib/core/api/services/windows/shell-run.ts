import { view_transition } from "$lib/core/utils/view-transition";
import { ShellError, type CommandContext, type Completion, type Value } from "../shell/type";
import { is_tagged } from "../shell/values";
import { is_desktop, is_mobile, short_id, type WindowValue } from "./shell";
import { WindowFlag, type DesktopWindowsService, type SnapZone, type WindowId, type WindowsService } from "./type";

/** Newest first, minimized ones included: they're still running. */
const recent = (windows: WindowsService) => windows.sorted_list(([, a], [, b]) => b.order - a.order).map(([id]) => id);

function value(windows: WindowsService, id: WindowId): WindowValue {
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

function find(windows: WindowsService, typed: string): WindowId {
  const matches = windows.list().filter((id) => id.startsWith(typed));
  if (matches.length === 1) return matches[0];
  throw new ShellError(
    matches.length === 0 ? `no window ${typed}` : `${typed} matches ${matches.length} windows; type more of the id`
  );
}

function is_window_value(value: Value): value is WindowValue {
  return is_tagged(value) && value.$type === "window" && typeof value.id === "string";
}

/** Ids given, else the windows piped in, else (alone on the line) the focused one. */
async function targets(
  windows: WindowsService,
  given: string[],
  context: CommandContext<unknown>
): Promise<WindowId[]> {
  if (given.length > 0) return given.map((typed) => find(windows, typed));
  if (!context.piped) {
    const id = windows.get_focused();
    if (!id) throw new ShellError("no window is focused");
    return [id];
  }
  const ids: WindowId[] = [];
  for await (const item of context.input) {
    if (is_window_value(item) && windows.exists(item.id)) ids.push(item.id);
    else if (typeof item === "string") ids.push(find(windows, item));
  }
  return ids;
}

export function bring(windows: WindowsService, id: WindowId | undefined) {
  if (!id) return;
  if (windows.get(id)?.flags.has(WindowFlag.MINIMIZED)) view_transition(() => windows.toggle_minimize(id));
  else windows.focus(id);
}

export function complete_window(windows: WindowsService): Completion[] {
  return recent(windows).map((id) => {
    const window = value(windows, id);
    return { value: short_id(id), detail: `${window.title} (${window.app})` };
  });
}

export function* list(windows: WindowsService) {
  for (const id of recent(windows)) yield value(windows, id);
}

export async function close(windows: WindowsService, context: CommandContext<{ ids: string[]; all: boolean }>) {
  if (context.args.all) {
    await windows.close_all();
    return;
  }
  for (const id of await targets(windows, context.args.ids, context)) {
    const instance = windows.get(id);
    if (instance?.flags.has(WindowFlag.MAXIMIZED) && !instance.dirty) view_transition(() => void windows.close(id));
    else await windows.close(id);
  }
}

export const focus = (windows: WindowsService, typed: string) => bring(windows, find(windows, typed));

export async function minimize(windows: WindowsService, context: CommandContext<{ ids: string[] }>) {
  const list = await targets(windows, context.args.ids, context);
  view_transition(() => {
    for (const id of list) windows.toggle_minimize(id);
  });
}

// From home nothing is focused, so the newest window is the one to bring back.
export const previous = (windows: WindowsService) =>
  bring(windows, windows.get_focused() ? recent(windows)[1] : recent(windows)[0]);

export const cycle = (windows: WindowsService) => bring(windows, recent(windows).at(-1));

export function show_desktop(windows: WindowsService) {
  view_transition(() => {
    if (is_mobile(windows)) windows.go_home();
    else if (is_desktop(windows)) windows.toggle_desktop();
  });
}

export async function maximize(desktop: DesktopWindowsService, context: CommandContext<{ ids: string[] }>) {
  const list = await targets(desktop, context.args.ids, context);
  view_transition(() => {
    for (const id of list) desktop.toggle_maximize(id);
  });
}

export function snap(desktop: DesktopWindowsService, args: { zone: SnapZone | "none"; id?: string }) {
  const id = args.id ? find(desktop, args.id) : desktop.get_focused();
  if (!id) throw new ShellError("no window is focused");
  view_transition(() => {
    const instance = desktop.get(id);
    // Maximize wins when rendering, so a snap from maximized has to leave it first.
    if (instance?.flags.has(WindowFlag.MAXIMIZED)) desktop.toggle_maximize(id);
    const zone = args.zone === "none" || instance?.snap_zone === args.zone ? null : args.zone;
    desktop.snap(id, zone);
  });
}

export const gather = (desktop: DesktopWindowsService) => view_transition(() => desktop.gather());
