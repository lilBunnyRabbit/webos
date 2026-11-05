import { z } from "zod";
import { DevToolsState, initial_state } from "./tools";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  state: DevToolsState.catch(initial_state),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { state: initial_state() };
}
