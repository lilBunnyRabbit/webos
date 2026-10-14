import type { z } from "zod";
import type { Command } from "./type";

/** Types `run`'s args from the schema, then erases them so commands of different shapes share one list. */
export function define_command<A extends z.ZodObject = z.ZodObject>(command: Command<A>): Command {
  return command as unknown as Command;
}
