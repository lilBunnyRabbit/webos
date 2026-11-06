# ADR-096: Harbour, a boat docking sim, and the play2d kit
**Date:** 2026-11-06
**Status:** Accepted

## Context
The owner wants a boat docking game in Drive Hub's top-down style, kept to its simple vibe ([brainstorm](../brainstorm/2026-11-06_harbour.md)). Drive Hub's core (`tight-spot/core/`, ADR-086 to ADR-088) is kinematic, with no mass and no slip, so a boat can't be one more vehicle. Its car-agnostic pieces (geometry, SAT collision, camera, frame loop, seeds, palette reader, small HUD components) are what a second 2D game needs. The [shared 2D layer brainstorm](../brainstorm/2026-10-28_shared-2d-layer.md) left the shape of a shared layer open until the boat was picked up.

## Decision

### Its own app
Harbour, id `harbour`, a user app, not a Drive Hub game.

### play2d kit
Before Harbour, one `refactor:` commit moves Drive Hub's car-agnostic pieces to the kit with no behaviour change, and Drive Hub imports them from there:
- `$kit/games/play2d/`: geometry, collision, camera, loop, seed, palette reader (`read_palette`, split out of `draw.ts`), draw-math, plus anything else car-agnostic Harbour imports (sound oscillators, gamepad, prefs) if it can move without dragging car code along.
- `$kit/components/play2d/`: steering wheel, speed chip, round card, key hint.

Collision then gains the minimum translation vector (axis and depth) for soft contacts, in the kit.

### Boat model in the app
`harbour/core/boat.ts`: a 3-DOF body (world pose, world velocity, yaw rate). Forces are computed in the body frame on water-relative velocity, with semi-implicit Euler at the frame loop's ≤ 1/120 s steps. The integrator is a small pure function, so it can move to the kit when a second user (F1 slip, Lunar Lander) needs a rigid body.

The first cut's terms:
- surge drag;
- a two-point keel (sway drag and yaw damping);
- prop thrust with an engine lag;
- a gearbox that passes through neutral;
- a rudder fed by prop wash (weak and reversed astern);
- an outboard that vectors its thrust (the RIB);
- prop walk astern;
- rudder lag;
- a dead band at rest.

Wind and current are left out. They enter the force sum as water- and air-relative velocity, so they slot in later.

Boats are specified by feel (`top_speed`, `carry`, `turn_rate`, `kick`, `walk`, …). A pure `coefficients(spec)` derives the force constants, and tests assert that a derived boat meets its feel numbers.

### Contacts
Soft fenders: a spring-damper along the contact normal at the contact point, with tangential friction, so a touch at the bow swings the stern. A touch is graded by the normal approach speed at first contact:
- kiss, under 0.15 m/s: free;
- bump, 0.15–0.5 m/s: costs the gentle star;
- hard, over 0.5 m/s: ends the round.

Hard walls and moored boats halve those limits.

### Docked and scoring
A boat is docked when it is in the berth, within 8° of the berth's heading, stopped and held for 1 s. Then the auto crew puts the lines on.
- A box berth is judged by `fit()`.
- An alongside berth needs the hull within 0.3 m of the edge along at least 70 % of the berth.

Stars: ★ docked, ★ gentle (every touch a kiss), ★ on time (at or under par). Precision ≥ 95 % is Perfect. Gear changes are not counted.

### Proof
Every level, and the sampled random and daily seeds, passes two checks:
- **Geometric:** the berth is wider than the beam plus the fenders, and the A* planner finds a path with the boat's turning circle.
- **Autopilot:** a closed-loop autopilot docks the real physics. Its run time sets the par.

### Controls
- **Throttle:** a single lever with detents (Full, Half and Slow astern, N, Slow, Half and Full ahead) that stays where it's left. W and S move it one notch; Space goes to neutral. On touch it's a vertical lever.
- **Hold-to-thrust:** a setting. Hold W for ahead; release is neutral.
- **Steering:** a wheel that holds its angle.
- **Speed:** in knots; distances in metres.
- **Assists:** none.

### World
- **Hub:** a small harbour you sail around with the real physics. Contacts bounce but never end anything.
- **Levels:** each level is a numbered pair of gate buoys with its stars on a sign. Sailing through it and stopping opens a start card, and the level loads as its own scene.
- **Random and Daily:** two more marked gates.
- **Boats:** sailing into the boat shed swaps RIB ↔ yacht.

### First cut
- Two boats: a 4.5 m RIB with an outboard, and a 10 m single-screw yacht with prop walk.
- Two spots: alongside and box berth.
- Calm water.
- 8 fixed levels, random and daily.

### Shell
A `daily` prop (ADR-050), so Game Hub's daily row opens it, plus `daily_rank`. No commands.

## Alternatives Considered
- **A Drive Hub game (`games/harbour/`).** It would share the frame, not the model. Physics, controls, judging and proof are all new, and it would be less visible in the store.
- **Copying the pieces into the app.** The copies drift, against the repo rule.
- **A hull member of ADR-088's drive union.** The planner, towing, gears and wheels all assume no slip and a scalar speed.
- **A generic rigid body in the kit now.** It has no second user yet.
- **The car contact rule (any touch ends).** It makes alongside docking nearly impossible.
- **Geometry-only proof.** It gives no par time and isn't a real proof.
- **A predicted-track ghost assist.** Owner: none. Judging momentum is the skill.
- **A chart menu or a level list as home.** The owner picked the sail-around hub.

## Consequences
- Drive Hub's imports change in a pure refactor. Its tests must stay green unchanged.
- The kit gains a 2D game layer that Lunar Lander can adopt later. The repo then has one camera, loop and collision.
- The autopilot can fail where a human would succeed. Generated levels may then drift easier, and the hard levels can be hand-checked.
- The frame loop's display-dependent step means a browser run isn't bit-identical to a Node proof. This doesn't affect play.
- P2 adds wind with gusts, current, a bow thruster, the twin-screw cruiser, and stern-to and buoy spots. P3 adds lines as tethers, the lock and the ferry.
