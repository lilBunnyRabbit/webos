import { z } from "zod";

/** Kinds the OS's own services complete. A service may add its own by contributing a completer. */
export const ArgKind = {
  PATH: "path",
  APP: "app",
  WINDOW: "window",
  COMMAND: "command",
  THEME: "theme",
  TASK: "task",
  JOB: "job",
  /** `10m`, `18:30`, `tomorrow 9:00`: read with `parse_when` (`$lib/core/utils/when`). */
  WHEN: "when",
} as const;

/** A string arg tagged with a completion kind: `arg.path()`. */
export const arg = {
  kind: (kind: string) => z.string().meta({ kind }),
  path: () => arg.kind(ArgKind.PATH),
  app: () => arg.kind(ArgKind.APP),
  window: () => arg.kind(ArgKind.WINDOW),
  task: () => arg.kind(ArgKind.TASK),
  job: () => arg.kind(ArgKind.JOB),
  when: () => arg.kind(ArgKind.WHEN),
};
