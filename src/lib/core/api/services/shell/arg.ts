import { z } from "zod";

/** Kinds the OS's own services complete. A service may add its own by contributing a completer. */
export const ArgKind = {
  PATH: "path",
  APP: "app",
  WINDOW: "window",
  COMMAND: "command",
  THEME: "theme",
} as const;

/** A string arg tagged with a completion kind: `arg.path()`. */
export const arg = {
  kind: (kind: string) => z.string().meta({ kind }),
  path: () => arg.kind(ArgKind.PATH),
  app: () => arg.kind(ArgKind.APP),
  window: () => arg.kind(ArgKind.WINDOW),
};
