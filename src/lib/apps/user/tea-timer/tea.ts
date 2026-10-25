import { z } from "zod";
import { format_time } from "$kit/games/time";
import { JobKind, type Job, type JobId, type JobInput } from "$lib/core/api/services/scheduler";

export const APP_ID = "tea-timer";
export const DATA_FILE = "teas.json";

export const Strength = { LIGHT: "light", MEDIUM: "medium", STRONG: "strong" } as const;
export type Strength = (typeof Strength)[keyof typeof Strength];

export const STRENGTHS = [
  { value: Strength.LIGHT, label: "Light" },
  { value: Strength.MEDIUM, label: "Medium" },
  { value: Strength.STRONG, label: "Strong" },
];

export const TempUnit = { C: "c", F: "f" } as const;
export type TempUnit = (typeof TempUnit)[keyof typeof TempUnit];

export const MAX_STEEPS = 10;

export const TeaFieldsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  temp_c: z.number().min(0).max(100),
  min_s: z.number().int().positive(),
  max_s: z.number().int().positive(),
  steeps: z.number().int().min(1).max(MAX_STEEPS),
  steep_extra_s: z.number().int().min(0),
  notes: z.string().max(500),
});
export type TeaFields = z.infer<typeof TeaFieldsSchema>;

export const TeaSchema = TeaFieldsSchema.extend({ id: z.string().min(1) });
export type Tea = z.infer<typeof TeaSchema>;

export const BrewExtrasSchema = z.object({
  tea: z.string(),
  steep: z.number().int().min(1),
  strength: z.enum(Strength),
});
export type BrewExtras = z.infer<typeof BrewExtrasSchema>;

export const TeaDataSchema = z.object({
  version: z.literal(1),
  custom: z.array(TeaSchema).catch([]),
  overrides: z.record(z.string(), TeaFieldsSchema).catch({}),
  hidden: z.array(z.string()).catch([]),
  unit: z.enum(TempUnit).catch(TempUnit.C),
  strength: z.record(z.string(), z.enum(Strength)).catch({}),
  brews: z.record(z.string(), BrewExtrasSchema).catch({}),
});
export type TeaData = z.infer<typeof TeaDataSchema>;

export const EMPTY_TEAS: TeaData = { version: 1, custom: [], overrides: {}, hidden: [], unit: TempUnit.C, strength: {}, brews: {} };

const MIN = 60;

export const BUILT_IN_TEAS: Tea[] = [
  { id: "black", name: "Black tea", temp_c: 95, min_s: 3 * MIN, max_s: 5 * MIN, steeps: 1, steep_extra_s: 0, notes: "Add milk or sugar once it's brewed." },
  { id: "earl-grey", name: "Earl Grey", temp_c: 95, min_s: 3 * MIN, max_s: 5 * MIN, steeps: 1, steep_extra_s: 0, notes: "Black tea with bergamot. Turns bitter past five minutes." },
  { id: "green", name: "Green tea", temp_c: 80, min_s: 2 * MIN, max_s: 3 * MIN, steeps: 3, steep_extra_s: 30, notes: "Boiling water scalds it: let the kettle rest a few minutes." },
  { id: "jasmine", name: "Jasmine tea", temp_c: 80, min_s: 2 * MIN, max_s: 3 * MIN, steeps: 3, steep_extra_s: 30, notes: "Green tea scented with jasmine flowers." },
  { id: "white", name: "White tea", temp_c: 80, min_s: 3 * MIN, max_s: 5 * MIN, steeps: 3, steep_extra_s: 60, notes: "Delicate: use more leaves rather than a longer steep." },
  { id: "oolong", name: "Oolong", temp_c: 90, min_s: 3 * MIN, max_s: 5 * MIN, steeps: 4, steep_extra_s: 30, notes: "Rolled leaves open up over several steeps." },
  { id: "pu-erh", name: "Pu-erh", temp_c: 95, min_s: 3 * MIN, max_s: 5 * MIN, steeps: 4, steep_extra_s: 60, notes: "Rinse the leaves with hot water for a few seconds first." },
  { id: "herbal", name: "Herbal tea", temp_c: 100, min_s: 5 * MIN, max_s: 7 * MIN, steeps: 1, steep_extra_s: 0, notes: "Boiling water, covered while it steeps." },
  { id: "chamomile", name: "Chamomile", temp_c: 100, min_s: 4 * MIN, max_s: 6 * MIN, steeps: 1, steep_extra_s: 0, notes: "Cover the cup so the oils stay in." },
  { id: "peppermint", name: "Peppermint", temp_c: 100, min_s: 5 * MIN, max_s: 7 * MIN, steeps: 1, steep_extra_s: 0, notes: "Cover the cup so the menthol stays in." },
  { id: "rooibos", name: "Rooibos", temp_c: 100, min_s: 5 * MIN, max_s: 7 * MIN, steeps: 1, steep_extra_s: 0, notes: "Never turns bitter, so a long steep is fine." },
  { id: "fruit", name: "Fruit tea", temp_c: 95, min_s: 5 * MIN, max_s: 7 * MIN, steeps: 1, steep_extra_s: 0, notes: "" },
];

const BUILT_IN_IDS = new Set(BUILT_IN_TEAS.map((tea) => tea.id));

export function is_built_in(id: string): boolean {
  return BUILT_IN_IDS.has(id);
}

export interface TeaEntry extends Tea {
  built_in: boolean;
  edited: boolean;
  hidden: boolean;
}

export function all_teas(data: TeaData): TeaEntry[] {
  const hidden = new Set(data.hidden);
  const built_in = BUILT_IN_TEAS.map((tea): TeaEntry => {
    const override = data.overrides[tea.id];
    return { ...tea, ...override, id: tea.id, built_in: true, edited: override !== undefined, hidden: hidden.has(tea.id) };
  });
  const custom = data.custom
    .filter((tea) => !is_built_in(tea.id))
    .map((tea): TeaEntry => ({ ...tea, built_in: false, edited: false, hidden: false }));
  return [...built_in, ...custom];
}

export function strength_of(data: TeaData, id: string): Strength {
  return data.strength[id] ?? Strength.MEDIUM;
}

export function strength_seconds(tea: TeaFields, strength: Strength): number {
  const low = Math.min(tea.min_s, tea.max_s);
  const high = Math.max(tea.min_s, tea.max_s);
  if (strength === Strength.LIGHT) return low;
  if (strength === Strength.STRONG) return high;
  return Math.round((low + high) / 2);
}

export function steep_seconds(tea: TeaFields, strength: Strength, steep: number): number {
  return strength_seconds(tea, strength) + Math.max(0, steep - 1) * tea.steep_extra_s;
}

export function c_to_f(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

/** One decimal, so a Fahrenheit value typed in reads back the same. */
export function f_to_c(f: number): number {
  return Math.round((((f - 32) * 5) / 9) * 10) / 10;
}

export function temp_in(c: number, unit: TempUnit): number {
  return unit === TempUnit.F ? c_to_f(c) : Math.round(c);
}

export function format_temp(c: number, unit: TempUnit): string {
  return `${temp_in(c, unit)} °${unit === TempUnit.F ? "F" : "C"}`;
}

export function format_seconds(seconds: number): string {
  return seconds % MIN === 0 ? `${seconds / MIN} min` : format_time(seconds * 1000);
}

export function format_range(tea: TeaFields): string {
  const low = Math.min(tea.min_s, tea.max_s);
  const high = Math.max(tea.min_s, tea.max_s);
  if (low === high) return format_seconds(low);
  if (low % MIN === 0 && high % MIN === 0) return `${low / MIN}–${high / MIN} min`;
  return `${format_time(low * 1000)}–${format_time(high * 1000)}`;
}

export function format_steeps(tea: TeaFields): string {
  if (tea.steeps <= 1) return "";
  if (tea.steep_extra_s <= 0) return `${tea.steeps} steeps`;
  return `${tea.steeps} steeps, +${tea.steep_extra_s < MIN ? `${tea.steep_extra_s} s` : format_seconds(tea.steep_extra_s)}`;
}

export interface TeaDraft {
  id: string | null;
  name: string;
  temp: number;
  min_minutes: number;
  max_minutes: number;
  steeps: number;
  extra_seconds: number;
  notes: string;
}

export function draft_of(tea: Tea | null, unit: TempUnit): TeaDraft {
  if (!tea) return { id: null, name: "", temp: temp_in(95, unit), min_minutes: 3, max_minutes: 5, steeps: 1, extra_seconds: 0, notes: "" };
  return {
    id: tea.id,
    name: tea.name,
    temp: temp_in(tea.temp_c, unit),
    min_minutes: tea.min_s / MIN,
    max_minutes: tea.max_s / MIN,
    steeps: tea.steeps,
    extra_seconds: tea.steep_extra_s,
    notes: tea.notes,
  };
}

export function fields_of(draft: TeaDraft, unit: TempUnit): TeaFields | string {
  const name = draft.name.trim();
  if (!name) return "Give the tea a name";
  const temp = Number(draft.temp);
  const temp_c = unit === TempUnit.F ? f_to_c(temp) : Math.round(temp * 10) / 10;
  if (!Number.isFinite(temp) || temp_c < 0 || temp_c > 100) return `The temperature goes from ${format_temp(0, unit)} to ${format_temp(100, unit)}`;
  const min_s = Math.round(Number(draft.min_minutes) * MIN);
  const max_s = Math.round(Number(draft.max_minutes) * MIN);
  if (!(min_s > 0) || !(max_s > 0)) return "Both times need to be more than zero";
  if (min_s > max_s) return "The shortest time can't be longer than the longest";
  const steeps = Math.round(Number(draft.steeps));
  if (!(steeps >= 1 && steeps <= MAX_STEEPS)) return `Steeps go from 1 to ${MAX_STEEPS}`;
  const steep_extra_s = steeps > 1 ? Math.round(Number(draft.extra_seconds)) : 0;
  if (!(steep_extra_s >= 0)) return "Extra time per steep can't be negative";
  return { name: name.slice(0, 60), temp_c, min_s, max_s, steeps, steep_extra_s, notes: draft.notes.trim().slice(0, 500) };
}

export function new_id(): string {
  return crypto.randomUUID().slice(0, 8);
}

const BREW_PREFIX = `${APP_ID}:brew-`;
const READY = " is ready";

export const brew_job_id = (id: string): JobId => `${BREW_PREFIX}${id}`;

export interface Brew {
  id: string;
  job: JobId;
  tea_id: string;
  tea: TeaEntry | null;
  name: string;
  steep: number;
  strength: Strength;
  end_at: number;
  duration_ms: number;
  ready: boolean;
}

export function strength_label(strength: Strength): string {
  return STRENGTHS.find((entry) => entry.value === strength)?.label ?? "";
}

export function brew_message(tea: TeaFields, strength: Strength, steep: number): string {
  const steeps = tea.steeps > 1 ? `Steep ${steep} of ${tea.steeps}` : "";
  return [steeps, strength_label(strength), format_seconds(steep_seconds(tea, strength, steep))].filter(Boolean).join(" · ");
}

export function brew_input(id: string, tea: TeaFields, strength: Strength, steep: number, now: number): JobInput {
  return {
    key: `brew-${id}`,
    title: `${tea.name}${READY}`,
    message: brew_message(tea, strength, steep),
    at: { epoch: now + steep_seconds(tea, strength, steep) * 1000 },
    kind: JobKind.TIMER,
    open: { app: APP_ID },
  };
}

/** Armed is brewing, whatever the extras say; disarmed is ready. A job without extras still shows, by its title. */
export function brew_of(job: Job, extras: BrewExtras | undefined, teas: TeaEntry[]): Brew | null {
  if (job.app !== APP_ID || job.kind !== JobKind.TIMER || !job.id.startsWith(BREW_PREFIX) || !("epoch" in job.at)) return null;
  const end = job.at.epoch;
  const tea = extras ? (teas.find((entry) => entry.id === extras.tea) ?? null) : null;
  return {
    id: job.id.slice(BREW_PREFIX.length),
    job: job.id,
    tea_id: extras?.tea ?? "",
    tea,
    name: tea?.name ?? (job.title.endsWith(READY) ? job.title.slice(0, -READY.length) : job.title),
    steep: extras?.steep ?? 1,
    strength: extras?.strength ?? Strength.MEDIUM,
    end_at: end,
    duration_ms: Math.max(1000, end - (job.armed_at ?? end)),
    ready: !job.armed,
  };
}

export function brews_of(jobs: Job[], data: TeaData, teas: TeaEntry[]): Brew[] {
  return jobs
    .flatMap((job) => brew_of(job, data.brews[job.id], teas) ?? [])
    .sort((a, b) => Number(b.ready) - Number(a.ready) || a.end_at - b.end_at);
}

export function next_steep(brew: Brew): number | null {
  if (!brew.ready || !brew.tea || brew.steep >= brew.tea.steeps) return null;
  return brew.steep + 1;
}

export function brew_remaining(brew: Brew, now: number): number {
  return brew.ready ? 0 : Math.max(0, brew.end_at - now);
}

export function drop_orphans(data: TeaData, jobs: Job[]): void {
  const ids = new Set(jobs.map((job) => job.id));
  for (const id of Object.keys(data.brews)) if (!ids.has(id)) delete data.brews[id];
}

export function delete_tea(data: TeaData, id: string): void {
  data.custom = data.custom.filter((tea) => tea.id !== id);
  delete data.strength[id];
}

export function save_tea(data: TeaData, id: string | null, fields: TeaFields): string {
  if (id && is_built_in(id)) {
    data.overrides[id] = fields;
    return id;
  }
  const index = id ? data.custom.findIndex((tea) => tea.id === id) : -1;
  if (index >= 0) {
    data.custom[index] = { ...fields, id: data.custom[index].id };
    return data.custom[index].id;
  }
  const key = `custom-${new_id()}`;
  data.custom.push({ ...fields, id: key });
  return key;
}

export function set_hidden(data: TeaData, id: string, hidden: boolean): void {
  data.hidden = hidden ? [...new Set([...data.hidden, id])] : data.hidden.filter((entry) => entry !== id);
}
