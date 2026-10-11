import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import { SnapZone, WindowFlag, type WindowSnapshot } from "../windows/type";

export const SESSION_PATH = `${PATHS.var_lib}/session/session.json`;
const SESSION_VERSION = 1;

/** The only window flags worth restoring; `debug` and future transient flags stay out. */
export const SESSION_FLAGS: WindowFlag[] = [WindowFlag.MINIMIZED, WindowFlag.MAXIMIZED];

const snapshot_schema = z.object({
  app_id: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
  bounds: z.object({ x: z.number(), y: z.number(), width: z.number().positive(), height: z.number().positive() }),
  flags: z.array(z.enum(SESSION_FLAGS)),
  snap_zone: z.enum(Object.values(SnapZone)).nullable(),
  state: z.record(z.string(), z.unknown()).optional(),
});

const session_schema = z.object({
  version: z.literal(SESSION_VERSION),
  windows: z.array(snapshot_schema),
});

/** An unknown version or a corrupt file means there's no session to offer. */
export function parse_session(text: string): WindowSnapshot[] {
  try {
    const result = session_schema.safeParse(JSON.parse(text));
    return result.success ? result.data.windows : [];
  } catch {
    return [];
  }
}

export function serialize_session(windows: WindowSnapshot[]): string {
  return JSON.stringify({ version: SESSION_VERSION, windows }, null, 2);
}
