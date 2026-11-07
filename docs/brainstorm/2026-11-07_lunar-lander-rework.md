# Lunar Lander rework: the Harbour and Airfield pattern
**Date:** 2026-11-07
**Participants:** owner, Claude

## Context
Owner, 11-07: "update the lunar lander in the same way we have all of this the drive hub, harbour, airfield - same designes, polished ui/ux, polished physics, levels, etc".

What exists today (`src/lib/apps/user/lunar-lander/`, about 1.6k lines):
- **Model** (`game.ts`):
  - an arcade world of 400×250 units, y down;
  - thrusters as on/off forces at points, so the RCS torque is real;
  - gravity presets of real g × 6, linear air drag, sine wind, fuel 100, walls at the edges.
- **Loop:** its own 120 Hz accumulator (`play.svelte:122`), with the judder the kit's `frame_loop` fixed for the other games.
- **Terrain and scoring:** one fixed hill line and one pad (`game.ts:81-110`). A points score (soft 500, level 200, centre 200, fuel × 4), with a best per ship and setting combo in `storage.json`.
- **Ships, achievements, gaps:**
  - three ships: the lander (main + RCS), twin pods (differential mains) and the shuttle (nose and tail mains);
  - six achievements with unprefixed ids;
  - no daily, no camera, no sound, no `docs/apps` page.
- **Shared code:** Harbour and Airfield each carry near-copies of `rounds.ts`, `chart.worker.ts` (identical), `chart-job.ts`, `progress.ts` and the sound base. The lander would be their third user.

## Topics discussed

### Home (decided)
Rework in place, keeping the id `lunar-lander`, so installs and the store entry stay.
- The old points bests are dropped: stars replace points.
- The six achievement ids are kept and re-mapped, so unlocks survive.
- Rejected: a new app id and retiring the old one (two store entries, unlocks lost).

### Physics (decided)
Real scale with a feel solver:
- Metres and real g: Moon 1.62, Mars 3.71, Earth 9.81 m/s².
- Each ship is a feel spec solved into thrust, inertia and RCS by `coefficients()` and checked by `measure_*` tests, as in Airfield. The feel fields are hover throttle, peak spin rate, the limits for a safe landing, and the tank in seconds of hover.
- A variable main engine on the throttle lever.
- RCS torque stays real, so inertia is part of the skill.
- The camera zooms with height.
- Rejected: keeping the arcade units and on/off thrust (it breaks the real-numbers style of the other two, and hovering at real scale becomes tapping).

### Progression (decided)
A mission campaign, not per-body or per-ship tracks.
- One linear campaign mixing bodies and ships.
- Mission kinds in v1:
  - **pad landing:** pads between ridges and in craters;
  - **cargo or hop:** land, pick up a crate or crew, hop to a second pad, with the mass changing the feel mid-mission;
  - **caves and hazards:** caverns, canyons and overhangs, Mars gusts; rock is a crash.
- Rejected:
  - per-body tracks of five levels (the recommended option);
  - per-ship tracks.

### Ships (decided)
Keep the three and re-spec each by feel. The lander, the twin pods (differential, no RCS) and the heavy shuttle keep their identities. Campaign missions name the ship, and missions unlock ships for the base.
- Rejected:
  - adding a hopper or a cargo lander (more tuning and proof work);
  - one ship with upgrades (loses the variety).

### Controls (decided)
Lever plus rotate.
- **Desktop:**
  - W/S or Shift/Ctrl move the throttle lever, which has Airfield-style detents including a Hover mark;
  - A/D rotate through the RCS;
  - Space is a full burn while held.
- **Touch:** the kit `Lever` on the left, rotate buttons or a pad on the right.
- **Pods:** A/D split the thrust between the two engines.
- Rejected: hold-to-burn only.

### Hub, scoring and kit (decided)
- **Base hub:** you fly around a moon base. Pads are the mission gates, and a hangar is the picker.
- **Stars:** done, gentle (one kiss touchdown) and under par time. Par is set from an autopilot proof, `ceil(1.4 × autopilot + 8)`.
- **Kit refactor first:** a `refactor:` commit moves `rounds`, the chart worker and job, the progress helpers and the sound base into the play2d kit. Harbour and Airfield are rewired with their tests unchanged.
- Rejected:
  - a level menu with copied files (a third copy that would drift);
  - fuel as par (the daily ranking would need a fuel mode).

### Extras (decided)
- A seeded random mission and a Game Hub daily ranked by time.
- **Free flight at the base:** any unlocked ship and a body picker. The old air, wind and infinite-fuel switches live on as free-flight settings.
- Experimental (ADR-097) until the feel is tuned.
- **Shell:** nothing beyond `app launch lunar-lander`. The owner left the shell option unpicked.

### Deorbit (decided)
Deorbit-and-descent missions come later, not in v1.

## Key takeaways
- Same pattern as Airfield: a feel spec into coefficients, graded touchdowns, a hub with a picker, and an autopilot proof. A campaign replaces the tracks.
- The third user of the round pieces moves them to the kit.

## Action items
- [x] `refactor:` play2d kit rounds, chart worker and job, progress, sound base; Harbour and Airfield rewired.
- [ ] Lander model and ship specs, base hub, campaign, autopilot proof, random, daily, docs page.
- [ ] Owner flies it and reports the feel.

## Next session topics
- Feel notes.
- Deorbit and descent missions with a profile inset.
- A fourth ship (hopper or cargo lander).
