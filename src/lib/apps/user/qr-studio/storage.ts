import { z } from "zod";
import { Ecc, MAX_VERSION, MIN_VERSION } from "./encode/tables";
import { DEFAULT_STYLE } from "./render";

export const Format = { PNG: "png", SVG: "svg" } as const;
export type Format = (typeof Format)[keyof typeof Format];
export const AUTO = "auto";

const HEX = /^#[0-9a-f]{6}$/i;

const options_schema = z.object({
  ecc: z.enum([Ecc.L, Ecc.M, Ecc.Q, Ecc.H]).catch(Ecc.M),
  min_version: z.number().int().min(MIN_VERSION).max(MAX_VERSION).catch(MIN_VERSION),
  mask: z.enum([AUTO, "0", "1", "2", "3", "4", "5", "6", "7"]).catch(AUTO),
  format: z.enum([Format.PNG, Format.SVG]).catch(Format.PNG),
});

const style_schema = z.object({
  quiet: z.number().int().min(0).max(20).catch(DEFAULT_STYLE.quiet),
  scale: z.number().int().min(1).max(64).catch(DEFAULT_STYLE.scale),
  dark: z.string().regex(HEX).catch(DEFAULT_STYLE.dark),
  light: z.string().regex(HEX).catch(DEFAULT_STYLE.light),
  transparent: z.boolean().catch(DEFAULT_STYLE.transparent),
});

function default_options(): z.infer<typeof options_schema> {
  return { ecc: Ecc.M, min_version: MIN_VERSION, mask: AUTO, format: Format.PNG };
}

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  options: options_schema.catch(default_options),
  style: style_schema.catch(() => ({ ...DEFAULT_STYLE })),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { options: default_options(), style: { ...DEFAULT_STYLE } };
}
