# Forklift: rack tiers and the side view
**Date:** 2026-10-29
**Participants:** owner, Claude (idea from LaxDOTexe)

## Context
LaxDOTexe: "when you pick up a pallet from upper racks you can show a different pov … and you move it up and down then drive it in by pressing right. maybe the forks move up then down autmatically and you have to click to stop it in the right place". A sketch showed a side view: the mast and forks on the left, a pallet on a rack beam above.
Today the warehouse has no heights: one slot per rack bay, picked from above by driving in and pressing F (`games/forklift/warehouse.ts`, `docs/apps/tight-spot.md` "Picking up and putting down").

## Decisions
- **Tiers per bay.** Each rack bay gets two or three tiers (floor, about 1.5 m, about 3 m); a slot gains `tier`. Top-down keeps one footprint per bay, with the tier shown as a pill (↑2) and stacked stock drawn offset. Tasks pick and drop at any tier; difficulty raises the share of upper tiers. The proofs stay as they are (same footprint).
- **The side view opens for upper tiers only.** Floor picks stay as today. At an upper tier the forklift stands squared at the bay face (the same `fork_fit` rule, short of fully in) and F opens a side view over the board; the lift or the put-away happens there, then the view returns to top-down.
- **Manual control.** Up and down raise and lower the forks at a fixed rate; right drives them in (left backs out). Touch and pad get matching controls. Rejected: the auto sweep with tap to stop (Lax's "maybe"; pure timing); both modes (two to build and tune).
- **A miss.** Within ±4 cm of the pocket height is clean; 4–10 cm goes in with a scrape that costs precision; beyond that, driving in hits the pallet or the beam: contact, the round ends (Forklift's rule). The height can be corrected before driving in. Precision counts the height.
- Credit: LaxDOTexe (ROADMAP line and here).

## Action items
1. [x] One build in `games/forklift/`: tiers in the warehouse and jobs, the top-down tier pills, the side view, judging and precision, docs.

## Build notes (2026-10-29)
- Tiers per rack face (2 or 3), from a rng of their own, so the floor-level jobs of every seed stay the same; the job's rack slots go up with a share of 25 % (easy) to 60 % (hard).
- The tightest aisle went from 4.0 to 4.4 m: standing square at the face with the tips short of the pallet needs the whole forklift (and its load) in the aisle, and at 4.0 m the planner could only find that 5 cm window on some levels. Levels changed with it (all 16 re-proven).
- After a lift or a put-down at an upper tier the forks stay raised into that slot until they're out of it, so backing out over floor stock is clean; then they drop to travel height.
- In the side view F lifts or lowers, Esc (or Back) leaves it while the forks are out; the pedals and the steer buttons double as up/down and in/out on touch, with four 44 px buttons of its own.
- Too low hits the beam ("The forks hit a rack beam" / "The load hit a rack beam"); too high on a pick jams the forks into the pallet.
- Precision multiplies `fit()` by 1 − e² per height miss (e = miss / 10 cm), the lift's and the put-down's.
- Achievement: Top shelf, a put-away on a 3 m shelf with both misses within 4 cm.
