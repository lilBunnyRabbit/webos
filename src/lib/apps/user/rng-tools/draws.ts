import { z } from "zod";
import { check_numbers, generate_numbers, type NumberRequest } from "./numbers";
import { crypto_source, type Checked, type RandomSource } from "./random";

export const MAX_DRAW_LISTS = 10;
export const MAX_DRAW_PRESETS = 50;
export const MAX_PRESET_NAME = 40;

export interface DrawList {
  id: string;
  min: number;
  max: number;
  count: number;
}

export interface DrawPreset {
  id: string;
  name: string;
  lists: DrawList[];
}

export interface DrawListDraft {
  id: string;
  min: number | null;
  max: number | null;
  count: number | null;
}

export interface DrawPresetDraft {
  id: string;
  name: string;
  lists: DrawListDraft[];
}

export type DrawResult = number[][];

const draw_list_schema = z.object({
  id: z.string(),
  min: z.number().int(),
  max: z.number().int(),
  count: z.number().int(),
});

export const draw_presets_schema = z.array(z.object({ id: z.string(), name: z.string(), lists: z.array(draw_list_schema) }));

export const draw_results_schema = z.record(z.string(), z.array(z.array(z.number().int())));

export function new_list(): DrawListDraft {
  return { id: crypto.randomUUID(), min: 1, max: 49, count: 6 };
}

export function new_draft(): DrawPresetDraft {
  return { id: crypto.randomUUID(), name: "", lists: [new_list()] };
}

export function to_draft(preset: DrawPreset): DrawPresetDraft {
  return { ...preset, lists: preset.lists.map((list) => ({ ...list })) };
}

export function check_list({ min, max, count }: DrawListDraft): Checked<NumberRequest> {
  return check_numbers({ min, max, count, unique: true });
}

export function check_preset(draft: DrawPresetDraft): Checked<DrawPreset> {
  const name = draft.name.trim();
  if (name === "") return { ok: false, error: "Give the preset a name." };
  if (name.length > MAX_PRESET_NAME) return { ok: false, error: `Keep the name to ${MAX_PRESET_NAME} characters.` };
  if (draft.lists.length === 0) return { ok: false, error: "Add at least one list." };
  if (draft.lists.length > MAX_DRAW_LISTS) return { ok: false, error: `A preset holds up to ${MAX_DRAW_LISTS} lists.` };

  const lists: DrawList[] = [];
  for (const [index, list] of draft.lists.entries()) {
    const checked = check_list(list);
    if (!checked.ok) return { ok: false, error: `List ${index + 1}: ${checked.error}` };
    lists.push({ id: list.id, min: checked.value.min, max: checked.value.max, count: checked.value.count });
  }
  return { ok: true, value: { id: draft.id, name, lists } };
}

export function draw_preset(preset: DrawPreset, source: RandomSource = crypto_source): DrawResult {
  return preset.lists.map(({ min, max, count }) =>
    generate_numbers({ min, max, count, unique: true }, source).sort((a, b) => a - b)
  );
}

export function same_lists(a: readonly DrawList[], b: readonly DrawList[]): boolean {
  return a.length === b.length && a.every((list, i) => list.min === b[i].min && list.max === b[i].max && list.count === b[i].count);
}

export function move<T>(items: readonly T[], index: number, offset: number): T[] {
  const target = index + offset;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const result = [...items];
  const [item] = result.splice(index, 1);
  result.splice(target, 0, item);
  return result;
}

export function format_draw(result: DrawResult): string {
  return result.map((values) => values.join(", ")).join("\n");
}
