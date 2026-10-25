# Tea Timer
Id `tea-timer` · Source: `src/lib/apps/user/tea-timer/` · [scheduler](../system/services/scheduler.md#apps-on-it) · [brainstorm](../brainstorm/2026-10-25_tea-timer.md)

## What it does

A list of teas, each with its water temperature, a brewing time range, how many times the leaves brew and notes. Pick a strength, press Brew, and a cup starts counting down; it rings when the tea is ready, with Tea Timer closed, in any WebOS tab. Several cups brew at once. A tea that brews again offers the next steep from the ready cup. Built-in presets cover the common teas; you can edit or hide them and add your own. Temperatures read in °C or °F.

## How it works

Pure logic is in `tea.ts` (Node-tested in `tea.test.ts`); the scheduler writes are in `jobs.ts` (browser-tested in `jobs.browser.test.ts`); the window is `tea-timer.app.svelte` with `tea-card`, `brew-card` and `tea-editor`.

### The tea model

```ts
interface TeaFields { name; temp_c; min_s; max_s; steeps; steep_extra_s; notes }
```

Times are whole seconds, the temperature is °C (one decimal at most), `steeps` is how many times the leaves brew (1 = once, at most 10) and `steep_extra_s` is the time each later steep adds.

Built-ins live in code (`BUILT_IN_TEAS`), in this order:

| Tea | Water | Time | Steeps |
|-----|-------|------|--------|
| Black tea | 95 °C | 3–5 min | 1 |
| Earl Grey | 95 °C | 3–5 min | 1 |
| Green tea | 80 °C | 2–3 min | 3, +30 s |
| Jasmine tea | 80 °C | 2–3 min | 3, +30 s |
| White tea | 80 °C | 3–5 min | 3, +1 min |
| Oolong | 90 °C | 3–5 min | 4, +30 s |
| Pu-erh | 95 °C | 3–5 min | 4, +1 min |
| Herbal tea | 100 °C | 5–7 min | 1 |
| Chamomile | 100 °C | 4–6 min | 1 |
| Peppermint | 100 °C | 5–7 min | 1 |
| Rooibos | 100 °C | 5–7 min | 1 |
| Fruit tea | 95 °C | 5–7 min | 1 |

Black and fruit follow the owner's packets; the rest is the usual Western-style guidance. `all_teas(data)` lists the built-ins with their overrides laid over them (`edited`), marked `hidden` when hidden, then the custom teas. A custom tea with a built-in's id is ignored, so a hand-edited file can't shadow one. Built-ins are edited (an override holding the whole edited tea), reset (the override dropped) or hidden, never deleted; custom teas are added, edited and deleted. Hidden teas stay in the list behind the toolbar's "N hidden" toggle, dimmed, with Show in their menu.

### Strength and steeps

`strength_seconds(tea, strength)`: Light is the range's low end, Strong its high end, Medium the middle rounded to the second (2–3 min → 2:30). A range typed backwards maps the same way. Medium is the default; the last strength picked is kept per tea and is what Brew uses.

`steep_seconds(tea, strength, steep) = strength_seconds + (steep − 1) × steep_extra_s`. A cup keeps its strength across steeps.

### Units

Stored in °C. The toolbar's °C/°F switch is saved in the file. `c_to_f` rounds to whole degrees; the editor works in the chosen unit and `f_to_c` stores one decimal, so 200 °F is kept as 93.3 °C and reads back as 200 °F. The editor takes times in minutes (quarter steps) and the extra per steep in seconds; `fields_of(draft, unit)` validates and returns the stored fields or the sentence to show.

### Brews

One scheduler job per cup, `tea-timer:brew-{id}`, kind `timer`, `{ epoch }` at the end of the steep. Title "{tea} is ready", message "Steep 2 of 3 · Medium · 3 min" (the steep part only for teas with steeps), no buttons, a body click opens Tea Timer. The Brew and Steep clicks call `notifications.request_system()` before scheduling.

**State rule:** the job decides. Armed is brewing (ends at `at.epoch`, length `at.epoch − armed_at` for the ring); disarmed is ready, whether it rang or was missed. The extras in `teas.json` only say which tea, steep and strength. A job without extras still shows, named from its title. Writes go job first, then extras (`jobs.ts`), so the state is right in between.

- **Brew** schedules a new job, then writes the extras and the tea's last strength.
- **Steep N** (a ready cup whose tea has steeps left) schedules the same job again for the next steep, then writes `steep`. It uses the tea as it is now, so an edit made meanwhile counts.
- **Stop** (brewing) and **Done** (ready) cancel the job and drop extras whose job is gone.

Cups sort ready first, then by end. There's no pause: tea doesn't wait.

## Data

`/var/lib/apps/tea-timer/teas.json` (`app_data_path`), read and written through one shared `live_file` cell, so every window and tab sees a change at once and Backup includes it:

```json
{
  "version": 1,
  "custom": [{ "id": "custom-1a2b3c4d", "name": "Sencha", "temp_c": 75, "min_s": 60, "max_s": 120, "steeps": 3, "steep_extra_s": 20, "notes": "" }],
  "overrides": { "black": { "name": "Breakfast", "temp_c": 95, "min_s": 180, "max_s": 240, "steeps": 1, "steep_extra_s": 0, "notes": "" } },
  "hidden": ["rooibos"],
  "unit": "c",
  "strength": { "green": "light" },
  "brews": { "tea-timer:brew-5e6f7a8b": { "tea": "green", "steep": 2, "strength": "light" } }
}
```

Each top-level part falls back on its own (`.catch`), so one broken part doesn't lose the rest. No props, no shell commands (`app launch tea-timer`), no widget.

## Limits

- Rings while any WebOS tab is open, like every scheduler job.
- A deleted tea's running cup keeps going under its title but offers no further steep.
