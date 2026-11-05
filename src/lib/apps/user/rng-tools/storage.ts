import { z } from "zod";
import { draw_presets_schema } from "./draws";
import { DEFAULT_LIST_SETTINGS, list_settings_schema } from "./list";
import { DEFAULT_NUMBER_SETTINGS, number_settings_schema } from "./numbers";
import { DEFAULT_PASSWORD_SETTINGS, password_settings_schema } from "./password";
import { SECTION_IDS } from "./sections";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  section: z.enum(SECTION_IDS).catch("number"),
  "coin.tally": z
    .object({ heads: z.number().int().nonnegative(), tails: z.number().int().nonnegative() })
    .catch(() => ({ heads: 0, tails: 0 })),
  "dice.notation": z.string().catch("3d6+2"),
  draws: draw_presets_schema.catch(() => []),
  list: list_settings_schema.catch(() => ({ ...DEFAULT_LIST_SETTINGS })),
  number: number_settings_schema.catch(() => ({ ...DEFAULT_NUMBER_SETTINGS })),
  password: password_settings_schema.catch(() => ({ ...DEFAULT_PASSWORD_SETTINGS })),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return {
    section: "number",
    "coin.tally": { heads: 0, tails: 0 },
    "dice.notation": "3d6+2",
    draws: [],
    list: { ...DEFAULT_LIST_SETTINGS },
    number: { ...DEFAULT_NUMBER_SETTINGS },
    password: { ...DEFAULT_PASSWORD_SETTINGS },
  };
}
