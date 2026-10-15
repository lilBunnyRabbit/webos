import { z } from "zod";
import { normalize_hex } from "./color";
import {
  cel_key,
  DIRECTIONS,
  MAX_COLORS,
  MAX_FRAMES,
  MAX_LAYERS,
  MAX_SIDE,
  new_id,
  TRANSPARENT_HEX,
  type Frame,
  type Layer,
  type Sprite,
} from "./model";
import { content_bounds, extract, stamp } from "./raster";
import { decode_rle, encode_rle } from "./rle";

export const FORMAT = "hopsprite";
export const VERSION = 1;
export const EXTENSION = ".hopsprite";

const Int = z.number().int();
const Hex = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);

const FileSchema = z.object({
  format: z.literal(FORMAT),
  version: Int.min(1),
  width: Int.min(1).max(MAX_SIDE),
  height: Int.min(1).max(MAX_SIDE),
  palette: z.array(Hex).min(1).max(MAX_COLORS),
  layers: z
    .array(
      z.object({
        name: z.string().max(200),
        visible: z.boolean(),
        locked: z.boolean(),
        opacity: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(MAX_LAYERS),
  frames: z.array(z.object({ duration: Int.min(1).max(65535) })).min(1).max(MAX_FRAMES),
  cels: z.array(
    z.object({
      layer: Int.min(0),
      frame: Int.min(0),
      x: Int.min(0),
      y: Int.min(0),
      w: Int.min(1),
      h: Int.min(1),
      rle: z.array(z.tuple([Int.min(1), Int.min(0).max(MAX_COLORS - 1)])),
    })
  ),
  tags: z
    .array(z.object({ name: z.string().max(200), from: Int.min(0), to: Int.min(0), direction: z.enum(DIRECTIONS) }))
    .default([]),
});

export type HopspriteFile = z.infer<typeof FileSchema>;

export function parse_sprite(text: string): Sprite {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Hopsprite file: it isn't JSON");
  }
  const version = (json as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > VERSION) {
    throw new Error(`This file was made by a newer Hopsprite (format ${version})`);
  }
  const result = FileSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`This isn't a valid Hopsprite file: ${issue.path.join(".") || "root"} ${issue.message}`);
  }
  const file = result.data;

  const palette = file.palette.map(normalize_hex);
  palette[0] = TRANSPARENT_HEX;
  const layers: Layer[] = file.layers.map((layer) => ({ ...layer, id: new_id() }));
  const frames: Frame[] = file.frames.map((frame) => ({ ...frame, id: new_id() }));
  const cels = new Map<string, Uint8Array>();

  for (const [i, cel] of file.cels.entries()) {
    const layer = layers[cel.layer];
    const frame = frames[cel.frame];
    if (!layer || !frame) throw new Error(`Cel ${i} points at a layer or frame that doesn't exist`);
    if (cel.x + cel.w > file.width || cel.y + cel.h > file.height) throw new Error(`Cel ${i} reaches past the canvas`);
    const pixels = decode_rle(cel.rle, cel.w * cel.h);
    for (const index of pixels) if (index >= palette.length) throw new Error(`Cel ${i} uses colour ${index}, past the palette`);
    const key = cel_key(layer.id, frame.id);
    const data = cels.get(key) ?? new Uint8Array(file.width * file.height);
    stamp(data, file.width, file.height, pixels, cel.w, cel.h, cel.x, cel.y);
    cels.set(key, data);
  }

  const last = frames.length - 1;
  const tags = file.tags
    .filter((tag) => tag.from <= last)
    .map((tag) => ({ ...tag, to: Math.min(Math.max(tag.from, tag.to), last) }));

  return { width: file.width, height: file.height, palette, layers, frames, cels, tags };
}

export function to_file(sprite: Sprite): HopspriteFile {
  const cels: HopspriteFile["cels"] = [];
  sprite.layers.forEach((layer, l) => {
    sprite.frames.forEach((frame, f) => {
      const data = sprite.cels.get(cel_key(layer.id, frame.id));
      const bounds = data && content_bounds(data, sprite.width, sprite.height);
      if (!data || !bounds) return;
      const pixels = extract(data, sprite.width, bounds);
      cels.push({ layer: l, frame: f, x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height, rle: encode_rle(pixels) });
    });
  });
  return {
    format: FORMAT,
    version: VERSION,
    width: sprite.width,
    height: sprite.height,
    palette: [TRANSPARENT_HEX, ...sprite.palette.slice(1).map(normalize_hex)],
    layers: sprite.layers.map(({ name, visible, locked, opacity }) => ({ name, visible, locked, opacity })),
    frames: sprite.frames.map(({ duration }) => ({ duration })),
    cels,
    tags: sprite.tags.map((tag) => ({ ...tag })),
  };
}

// One cel per line keeps a saved file readable and diffable without bloating it with indented run arrays.
export function serialize_sprite(sprite: Sprite): string {
  const { cels, ...rest } = to_file(sprite);
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, "");
  const body = cels.map((cel) => `    ${JSON.stringify(cel)}`).join(",\n");
  return `${head},\n  "cels": [${cels.length ? `\n${body}\n  ` : ""}]\n}\n`;
}
