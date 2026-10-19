import { z } from "zod";
import { ItemSchema, ListMetaSchema } from "./data";

export const SYNC_VERSION = 1;
/** The data channel's label: a code from another app that pairs the same way connects, and is closed for this. */
export const CHANNEL_LABEL = "shopping-list";

/**
 * `hello`: the starting device's whole list, first thing on every connection. The joining device merges it (or creates
 * the list) and answers with whatever the starting device doesn't have yet, as `items`. After that both sides send
 * `items` with each change.
 */
export const SyncMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), version: z.literal(SYNC_VERSION), list: ListMetaSchema, items: z.array(ItemSchema) }),
  z.object({ type: z.literal("items"), items: z.array(ItemSchema) }),
]);
export type SyncMessage = z.infer<typeof SyncMessageSchema>;

/** `null` for anything that isn't a message of this version. */
export function parse_message(data: unknown): SyncMessage | null {
  if (typeof data !== "string") return null;
  try {
    const result = SyncMessageSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
