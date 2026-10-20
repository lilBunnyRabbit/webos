# Clock: everything at once

**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
LaxDOTexe: when you use a timer, the stopwatch and an alarm at the same time, you shouldn't have to switch tabs. Clicking a number floating on the desktop should open that part. Today Clock has four tabs (World, Alarms, Timers, Stopwatch). The widget shows one line (the next alarm or the soonest timer), and clicking it already opens the matching tab through the `tab` prop. The stopwatch is in window storage (`storage.persisted("stopwatch")`), so the widget can't see it.

## Decisions
- **Stopwatch moves into Clock's data file** next to timers and alarms (`started_at`, `elapsed`, `laps`), with a one-time migration from window storage. Every Clock window shares it; the widget and the All view can read it.
- **An All tab** (fifth Segmented option): a card for each thing in use (running timers with progress, the stopwatch with Lap and Pause, the next alarm, compact world clocks). A grid in wide windows, stacked in narrow ones and on mobile. Each card header opens its full tab. Opening Clock with two or more running things lands on All; otherwise the last tab.
- **Widget lists every active item**, as many as fit its size, then "+N more" (opens All). Each line opens its tab. With the Clear widget style, these are the floating numbers.

## Action items
- Build after widget styles are merged (both edit `clock/widget.svelte`). Changelog, ROADMAP line (idea from LaxDOTexe).
