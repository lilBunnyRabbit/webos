# Drive Hub: the Driving Test
**Date:** 2026-10-29
**Participants:** owner, Claude

## Context
Owner, earlier: the Driving Test is "the best one" and gets focus. Overnight plan: `docs/apps/drive-hub-games.md` games plan section 1.5 (scratchpad, not committed). Nothing exists yet. The car model is kinematic; Hot Lap caps steering by speed in its own `games/f1/grip.ts`.

## Decisions
- **Rules:** generic EU (Vienna-convention) signs, right-hand traffic, UK-style fault scheme: minor, serious, dangerous; more than 15 minors or any serious or dangerous fault fails. Rejected: one country's real test; a fictional rule set.
- **World:** a hand-made town as data (`games/test/town.ts`): a lane graph (lanes with centreline, width, speed limit, next lanes), junctions (T, crossroads, one roundabout), lights with phases, signs, stop and give-way lines, zebras, parked cars, plus its drawing. Fixed, not generated. Rejected: a core road model (one user); a generated network.
- **Speed-limited steering:** owner asked "is this sliding?" — no: the wheels just can't turn as far when fast (curvature at most a_lat / v²), no skid. Hot Lap's `grip.ts` moves to `core/grip.ts` in a `refactor:` commit; games opt in by calling it before `step()`, zero effect below parking speeds; Parking and the Warehouse don't call it. Replaced later by slip physics. Rejected: built into `step()` for everyone; a second copy.
- **Traffic in v1:** lights and parked cars, no moving traffic; give-way means slow and stop at the line when the sign says so. AI cars on the lane graph in v2, pedestrians in v3.
- **Indicators in core:** `Input` gains a signal (left, right, none) that self-cancels when the wheel unwinds past centre after a turn; a tick sound; blinkers drawn on every vehicle; other games ignore it. Keys: Z left, X right (the owner steers with the arrows, left hand free); crab moves from X to V (`CRAB_KEY`). Pad: D-pad left/right. Touch: two buttons above the wheel. Pressing the same side again cancels.
- **Examiner:** prompts as a text bubble and spoken through the speech service (like Pushback's ATC), timed by distance at speed so they come a few seconds before the junction.
- **Name:** Driving Test, id `test`, building Test Centre (a new `Building` constant and roof).
- **First cut:** one town (6–10 junctions, one roundabout, lights, signs, zebras, parked cars), indicators, speed-limited steering, three routes with the spoken examiner, about ten fault checks (speed over the limit, crossing a solid line, a red light, the stop line, no signal before a turn or pull-up, the wrong lane for the next turn, the kerb, lane position, hesitation, a give-way or stop sign), one bay park from Tight Spot mid-route, and a pass/fail fault sheet. A daily later.
- **Phones:** works in portrait and landscape; a one-time hint suggests landscape.
- **Proof:** a scripted closed-loop driver drives every route clean with zero faults (the false-fault guard); a few deliberate-fault drives raise exactly the expected faults. Lean.
- **Shell:** nothing; the `game` prop takes `test`.

## Action items
1. [x] `refactor:` Hot Lap's grip to `core/grip.ts`.
2. [x] `feat:` indicators in core (input, keys, pad, touch, sound, blinkers); crab to V.
3. [x] `feat:` the Driving Test, first cut.

## Next session topics
- AI traffic (v2), pedestrians (v3), a daily, more towns, licence categories (van, bus, truck, trailer).
