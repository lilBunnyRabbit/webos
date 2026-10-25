import { describe, expect, test } from "vitest";
import { JobKind, type Job } from "$lib/core/api/services/scheduler";
import {
  all_teas,
  brew_input,
  brew_of,
  brews_of,
  BUILT_IN_TEAS,
  c_to_f,
  delete_tea,
  draft_of,
  EMPTY_TEAS,
  f_to_c,
  fields_of,
  format_range,
  format_steeps,
  next_steep,
  save_tea,
  set_hidden,
  steep_seconds,
  Strength,
  strength_of,
  strength_seconds,
  TeaDataSchema,
  TempUnit,
  type TeaData,
  type TeaFields,
} from "./tea";

const fresh = (): TeaData => structuredClone(EMPTY_TEAS);
const tea = (id: string) => all_teas(fresh()).find((entry) => entry.id === id)!;

const GREEN: TeaFields = { name: "Green", temp_c: 80, min_s: 120, max_s: 180, steeps: 3, steep_extra_s: 30, notes: "" };

describe("presets", () => {
  test("black and fruit match the packets", () => {
    expect(tea("black")).toMatchObject({ temp_c: 95, min_s: 180, max_s: 300 });
    expect(tea("fruit")).toMatchObject({ temp_c: 95, min_s: 300, max_s: 420 });
  });

  test("every built-in parses and has a sane range", () => {
    for (const entry of BUILT_IN_TEAS) {
      expect(entry.min_s).toBeLessThanOrEqual(entry.max_s);
      expect(TeaDataSchema.parse({ ...EMPTY_TEAS, custom: [entry] }).custom[0]).toEqual(entry);
    }
  });
});

describe("strength", () => {
  test("light, medium and strong are the low end, the middle and the high end", () => {
    expect(strength_seconds(GREEN, Strength.LIGHT)).toBe(120);
    expect(strength_seconds(GREEN, Strength.MEDIUM)).toBe(150);
    expect(strength_seconds(GREEN, Strength.STRONG)).toBe(180);
  });

  test("a range typed backwards still maps the right way round", () => {
    expect(strength_seconds({ ...GREEN, min_s: 180, max_s: 120 }, Strength.LIGHT)).toBe(120);
  });

  test("medium is the default and the last pick is kept per tea", () => {
    const data = fresh();
    expect(strength_of(data, "green")).toBe(Strength.MEDIUM);
    data.strength.green = Strength.STRONG;
    expect(strength_of(data, "green")).toBe(Strength.STRONG);
    expect(strength_of(data, "black")).toBe(Strength.MEDIUM);
  });
});

describe("steeps", () => {
  test("each later steep adds the extra once more", () => {
    expect(steep_seconds(GREEN, Strength.MEDIUM, 1)).toBe(150);
    expect(steep_seconds(GREEN, Strength.MEDIUM, 2)).toBe(180);
    expect(steep_seconds(GREEN, Strength.LIGHT, 3)).toBe(180);
  });

  test("a ready brew offers the next steep until the tea has none left", () => {
    const teas = all_teas(fresh());
    const job: Job = { id: "tea-timer:brew-a", app: "tea-timer", title: "Green tea is ready", at: { epoch: 1000 }, armed: false, kind: JobKind.TIMER };
    expect(next_steep(brew_of(job, { tea: "green", steep: 1, strength: Strength.MEDIUM }, teas)!)).toBe(2);
    expect(next_steep(brew_of(job, { tea: "green", steep: 3, strength: Strength.MEDIUM }, teas)!)).toBeNull();
    expect(next_steep(brew_of(job, { tea: "black", steep: 1, strength: Strength.MEDIUM }, teas)!)).toBeNull();
    expect(next_steep(brew_of({ ...job, armed: true }, { tea: "green", steep: 1, strength: Strength.MEDIUM }, teas)!)).toBeNull();
  });

  test("labels", () => {
    expect(format_range(GREEN)).toBe("2–3 min");
    expect(format_range({ ...GREEN, min_s: 90 })).toBe("1:30–3:00");
    expect(format_steeps(GREEN)).toBe("3 steeps, +30 s");
    expect(format_steeps({ ...GREEN, steeps: 1 })).toBe("");
  });
});

describe("units", () => {
  test("°C to °F and back", () => {
    expect(c_to_f(100)).toBe(212);
    expect(c_to_f(80)).toBe(176);
    expect(f_to_c(212)).toBe(100);
    expect(c_to_f(f_to_c(200))).toBe(200);
  });

  test("the form edits in the chosen unit and stores °C", () => {
    const draft = draft_of(tea("green"), TempUnit.F);
    expect(draft.temp).toBe(176);
    expect(fields_of({ ...draft, temp: 200 }, TempUnit.F)).toMatchObject({ temp_c: 93.3 });
    expect(fields_of(draft_of(tea("green"), TempUnit.C), TempUnit.C)).toMatchObject({ temp_c: 80, min_s: 120, max_s: 180, steeps: 3, steep_extra_s: 30 });
  });

  test("the form says what's wrong", () => {
    const draft = draft_of(null, TempUnit.C);
    expect(fields_of(draft, TempUnit.C)).toBe("Give the tea a name");
    expect(fields_of({ ...draft, name: "x", temp: 120 }, TempUnit.C)).toMatch(/temperature/);
    expect(fields_of({ ...draft, name: "x", min_minutes: 6 }, TempUnit.C)).toMatch(/shortest/);
    expect(fields_of({ ...draft, name: "x", steeps: 1, extra_seconds: 40 }, TempUnit.C)).toMatchObject({ steep_extra_s: 0 });
  });
});

describe("built-ins, overrides and custom teas", () => {
  test("an override replaces a built-in's fields in place, reset drops it", () => {
    const data = fresh();
    save_tea(data, "black", { ...tea("black"), name: "Breakfast", max_s: 240 });
    const teas = all_teas(data);
    expect(teas[0]).toMatchObject({ id: "black", name: "Breakfast", max_s: 240, edited: true, built_in: true });
    delete data.overrides.black;
    expect(all_teas(data)[0]).toMatchObject({ name: "Black tea", edited: false });
  });

  test("hidden built-ins stay listed, marked", () => {
    const data = fresh();
    set_hidden(data, "rooibos", true);
    set_hidden(data, "rooibos", true);
    expect(data.hidden).toEqual(["rooibos"]);
    expect(all_teas(data).find((entry) => entry.id === "rooibos")?.hidden).toBe(true);
    set_hidden(data, "rooibos", false);
    expect(data.hidden).toEqual([]);
  });

  test("custom teas come after the built-ins; edit replaces, delete forgets", () => {
    const data = fresh();
    const id = save_tea(data, null, GREEN);
    expect(all_teas(data).at(-1)).toMatchObject({ id, name: "Green", built_in: false });
    expect(all_teas(data)).toHaveLength(BUILT_IN_TEAS.length + 1);
    save_tea(data, id, { ...GREEN, name: "Sencha" });
    expect(data.custom).toEqual([{ ...GREEN, name: "Sencha", id }]);
    data.strength[id] = Strength.LIGHT;
    delete_tea(data, id);
    expect(data.custom).toEqual([]);
    expect(data.strength).toEqual({});
  });

  test("a custom tea can't shadow a built-in id", () => {
    const data = TeaDataSchema.parse({ ...EMPTY_TEAS, custom: [{ ...GREEN, id: "black" }] });
    expect(all_teas(data).filter((entry) => entry.id === "black")).toHaveLength(1);
  });

  test("a broken part of the file falls back without losing the rest", () => {
    const data = TeaDataSchema.parse({ ...EMPTY_TEAS, unit: "kelvin", hidden: ["black"], overrides: { black: { name: "" } } });
    expect(data).toMatchObject({ unit: "c", hidden: ["black"], overrides: {} });
  });
});

describe("brews", () => {
  test("a brew is a timer job ending at the steep's time, opening Tea Timer, no buttons", () => {
    const input = brew_input("a1", GREEN, Strength.STRONG, 2, 1000);
    expect(input).toMatchObject({ key: "brew-a1", title: "Green is ready", message: "Steep 2 of 3 · Strong · 3:30", at: { epoch: 1000 + 210_000 }, kind: JobKind.TIMER, open: { app: "tea-timer" } });
    expect(input.actions).toBeUndefined();
  });

  test("armed is brewing, disarmed is ready; ready ones sort first", () => {
    const data = fresh();
    const teas = all_teas(data);
    const job = (id: string, armed: boolean, end: number): Job => ({ id: `tea-timer:brew-${id}`, app: "tea-timer", title: "Black tea is ready", at: { epoch: end }, armed, armed_at: end - 240_000, kind: JobKind.TIMER });
    data.brews["tea-timer:brew-a"] = { tea: "black", steep: 1, strength: Strength.MEDIUM };
    const list = brews_of([job("a", true, 5000), job("b", false, 9000), { ...job("c", true, 1), app: "clock" }], data, teas);
    expect(list.map((entry) => [entry.id, entry.ready])).toEqual([["b", true], ["a", false]]);
    expect(list[1]).toMatchObject({ name: "Black tea", tea_id: "black", duration_ms: 240_000 });
    expect(list[0]).toMatchObject({ name: "Black tea", tea: null, steep: 1 });
  });
});
