import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import { SnapZone, WindowFlag, type WindowFrames, type WindowSnapshot } from "../windows/type";

export const SESSION_PATH = `${PATHS.var_lib}/session/session.json`;
const SESSION_VERSION = 2;

/** The only window flags worth restoring; `debug` and future transient flags stay out. */
export const SESSION_FLAGS: WindowFlag[] = [WindowFlag.MINIMIZED, WindowFlag.MAXIMIZED];

const bounds_schema = z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() });

const snapshot_schema = z.object({
  app_id: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
  bounds: bounds_schema,
  flags: z.array(z.enum(SESSION_FLAGS)),
  snap_zone: z.enum(Object.values(SnapZone)).nullable(),
  state: z.record(z.string(), z.unknown()).optional(),
});

/** v1 had no frames; it still loads, with none (ADR-023 revision). */
const session_schema = z.discriminatedUnion("version", [
  z.object({ version: z.literal(1), windows: z.array(snapshot_schema) }),
  z.object({ version: z.literal(SESSION_VERSION), windows: z.array(snapshot_schema), frames: z.record(z.string(), bounds_schema) }),
]);

export interface SessionFile {
  windows: WindowSnapshot[];
  /** Each app's last closed window frame (ADR-014 revision). */
  frames: WindowFrames;
}

const EMPTY: SessionFile = { windows: [], frames: {} };

/** An unknown version or a corrupt file means there's no session to offer and no frames. */
export function parse_session(text: string): SessionFile {
  try {
    const result = session_schema.safeParse(JSON.parse(text));
    if (!result.success) return EMPTY;
    return { windows: result.data.windows, frames: "frames" in result.data ? result.data.frames : {} };
  } catch {
    return EMPTY;
  }
}

/** A path prop under /mnt: after a reload the mount is locked until a click reconnects it, so the window isn't saved (ADR-044). */
export function shows_mount(props: Record<string, unknown> | undefined): boolean {
  const is_mount_path = (value: unknown) => typeof value === "string" && value.startsWith(`${PATHS.mnt}/`);
  return Object.values(props ?? {}).some((value) => (Array.isArray(value) ? value.some(is_mount_path) : is_mount_path(value)));
}

export function serialize_session({ windows, frames }: SessionFile): string {
  return JSON.stringify({ version: SESSION_VERSION, windows, frames }, null, 2);
}

/** View state that lived in shared `persisted()` cells before `storage.window()`; now per window in the session. */
const LEGACY_VIEW_KEYS = [
  "app.settings.section",
  "app.activity-monitor.section",
  "app.style-guide.section",
  "app.kernel.expanded",
  "app.text-viewer.wrap",
];

export function remove_legacy_view_keys(): void {
  try {
    for (const key of LEGACY_VIEW_KEYS) localStorage.removeItem(key);
  } catch (error) {
    console.error("[SessionService] Failed to remove legacy view keys:", error);
  }
}
