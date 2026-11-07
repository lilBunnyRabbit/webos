# ADR-098: Airfield, a side-view takeoff and landing sim
**Date:** 2026-11-07
**Status:** Accepted (wave 1 implemented 2026-11-07)

## Context
After Drive Hub (top-down cars, ADR-086 to ADR-088) and Harbour (top-down boats, ADR-096), the owner wants a 2D plane sim in the same style, seen from the side ([brainstorm](../brainstorm/2026-11-07_plane-sim.md)). Harbour's pattern works: feel-based specs solved into coefficients, graded contacts, a drivable hub with a picker, per-level stars, and an autopilot that proves every level and sets par. The play2d kit (`$kit/utils/play2d/`) already holds the shared 2D pieces.

## Decision

### Its own app
Airfield, id `airfield`, a user app, marked `experimental: true` (ADR-097) until it has been tuned by feel. No shell contributions beyond `app launch airfield`.

### Flight model
A real longitudinal model in `airfield/core/plane.ts`, a pure step function like Harbour's `boat.ts`:
- **State:** x, altitude, vx, vy, pitch, pitch rate, engine spool, plus elevator, flap and gear contact state.
- **Air:** airspeed is ground velocity minus the wind, which carries steady head/tail wind, gusts and vertical air (thermals, sink, windshear). Angle of attack is pitch minus the air path angle.
- **Forces:**
  - lift from a CL(α) curve with a real stall (lift breaks past α_stall);
  - drag CD0 + k·CL², plus flaps, spoilers and gear;
  - ground effect within a wingspan of the ground;
  - prop thrust that falls with airspeed, or jet thrust with a long spool.
- **Pitch moment:** static stability Cmα, elevator with lag, pitch damping, trim, and the flap pitch change.
- **Ground:** main and tail (or nose) gear as contact springs, with rolling friction, brakes and reverse thrust. A taildragger can nose over on hard brakes, and a tail strike is detected.
- **Specs by feel:** stall speed, glide ratio, climb rate, cruise, pitch rate, flare float and roll-out are solved into coefficients and checked by measure functions, as `boats.ts` does for boats.

### Planes
- Trainer taildragger: the forgiving starter.
- Bush STOL: big flaps, short strips, steep approaches.
- Airliner: slow spool and pitch, spoilers, reverse, autobrake.
- Glider: no engine. Its levels start released at height; in the hub it goes up on a winch launch from the runway.

### Camera
A real-scale world. The camera zooms out with height and in near the ground, so the flare reads large. A small approach-profile inset shows the whole glidepath.

### Controls
- **Desktop:**
  - W/S or the arrows move the elevator, which springs back to trim; T trims to the current pitch.
  - Shift/Ctrl, or the lever's detents, set throttle.
  - F/V flaps, B brakes; spoilers and reverse are the airliner's lever positions below idle.
- **Touch:** a throttle lever on the left, a spring-back pitch pad on the right, and flap and brake buttons.
- **Mouse:** vertical drag for pitch.

### Scoring
Three stars per level: done, gentle and under par.
- **Landing done:** stopped on the runway.
- **Takeoff done:** obstacle cleared, with no tail strike and no stall.
- **Touchdown grades** by sink rate: kiss under 0.6 m/s, firm under 1.5 m/s. Hard is 3 m/s or more, or a stall below 20 m, and either is a crash that ends the round.

Par is `ceil(1.4 × autopilot + 8)`, as in Harbour.

### Levels and hub
- **Tracks:** each plane has its own track of five levels built for its feel, plus random and a Game Hub daily for any plane.
- **Proof:** every level is proven by an autopilot that flies the takeoff, the glidepath and the flare.
- **Hub:** a side-view home airfield. Taxi left or right to a hangar, which is the plane picker like Harbour's shed, and to level gates on the apron. Or take off and fly free over the field.

### Sharing
- **Throttle lever:** Harbour's `lever.svelte` and `core/lever.ts` move to the kit first, in a `refactor:` commit with no behaviour change; Harbour's imports are rewired.
- **Everything else stays in the app:** the flight model, the spring-back pitch pad and the weather. Each has one user.

### Build order
Feel first, then waves; nothing ships before wave 3.
1. The model, the trainer, the hub and free flight over one field. The owner reports the feel.
2. The STOL, the airliner, the glider and the weather. The owner tunes the feel.
3. Levels, autopilot proof, par, random and daily. Then ship as experimental.

### Persistence
Progress and settings go through `storage.file()` in `/var/lib/apps/airfield/`, the same shape as Harbour's.

## Alternatives Considered
- **A Harbour mode or Drive Hub game.** Rejected: it would share no model, and it would be less visible in the store.
- **Semi-arcade pitch-rate control.** Rejected: it loses the energy game, pitch for speed and power for sink.
- **A compressed world or a fixed zoom.** Rejected: the numbers stop being real, or the game reads as cartoonish.
- **Landing-only or full route missions.** Rejected: the owner wants takeoffs as core, and routes make levels long and the proof hard.
- **Shared levels scaled per plane.** Rejected: a 40 m STOL strip is meaningless for an airliner, and a glider can't take off.
- **A points score.** Rejected: it breaks the stars style of the other games.
- **A generic rigid body in the kit.** Rejected: Harbour's is planar with yaw and this one is longitudinal with pitch, so they share no state shape.

## Consequences
- **Proof is fragile to retunes.** This is the same risk as Harbour, so proof margins start wide.
- **Scope:** four planes, weather and twenty levels make this bigger than Harbour, which is why it is built in waves.
- **The lever gets a second user,** which moves it to the kit.
- **New per-app page:** `docs/apps/airfield.md` and its row in CLAUDE.md.

## Revision 2026-11-07: wave 1 built
Wave 1 (the model, the trainer, the hub and free flight) is in `src/lib/apps/user/airfield/`, documented in [apps/airfield.md](../apps/airfield.md). What the build decided inside the ADR's scope:
- **Turning round.** A side view still needs a way back to the runway, so the state carries a heading (`yaw`), `vz` and a `bank`. A/D (or ←/→, or the touch ◀ ▶ buttons) set the way to face: on the ground the plane pivots below 6 m/s; in the air it banks 30° into a coordinated turn, the short way round, and rolls out facing the other way. The roll axis is scripted, not modelled. The banked wing's lost lift is real, so a turn costs height unless the pilot holds some back stick, and a turn started too low catches a wingtip.
- **Keys.** E and Q work the throttle as well as Shift and Ctrl, since Ctrl+W closes the browser tab. Held W/S move the stick at a hand's pace and it springs back to the trim; B ramps the brakes up over 0.8 s, so a tap is gentle and a long hold can nose the taildragger over. R puts the plane back on the apron. A Pitch setting (Up is up, Pilot) flips W/↑ and the drag directions.
- **Trim** (T) sets the elevator that holds the current angle of attack hands off, so the plane keeps the speed it has.
- **Throttle detents:** Idle, Quarter, Half, Cruise (0.75), Full. **Flaps:** Up, Half, Full.
- **Grading in the hub:** a touchdown 1.5–3 m/s is graded Heavy (no name in the ADR); 3 m/s or more, a prop strike, a hull or wingtip on the ground are crashes. "A stall below 20 m is a crash" waits for round scoring in wave 3.
- **HUD:** besides airspeed, height, vertical speed, flaps, throttle and the stall warning, a trim chip and the distance to the runway ahead when airborne, since at circuit height the runway is out of view.

## Revision 2026-11-07: no turning in the air, a wrapping world
The owner saw no point in the scripted bank turn. It replaces the "Turning round" item above:
- **In the air** the plane only flies the way it faces. There's no bank and no heading change, and A/D do nothing. The air model is pure 2D: pitch, power, energy.
- **On the ground** A/D still flip the facing below taxi speed, so the plane can taxi back.
- **The world wraps.** x is a loop about 8 km round, so flying on brings the plane back to the home field from behind. The profile inset and the Runway chip measure distance along the wrap.
- **Levels are one-way:** take off at A and land at B, or fly round the wrap to land where you started.

Rejected:
- **A loop to turn round:** the trainer barely has the energy for one, and the airliner can't loop.
- **Keeping the bank turn:** it animates a 3D move the player doesn't control, and it reads oddly side-on.
