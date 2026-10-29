# Drive Hub controller support
**Date:** 2026-10-29
**Participants:** owner, Claude

## Context
Owner: "can we have controller support?" No gamepad code exists in the repo. Drive Hub's input is `core/drive-input.svelte.ts` (`DriveInput`): keys and touch pedals merged into `Input` (`steer`, `throttle` 0..1, `brake` 0..1), so analog fits. Gears and the primary action go through each game's `on_keydown` with `GEAR_KEYS` (`core/keys.ts`).

## Decisions
- **Scope: Drive Hub only.** A pure `core/gamepad.ts` (poll, deadzones, button edges) and `DriveInput` merging it into `Input`. Cards and menus stay mouse, touch and keyboard. Rejected: a kit util for every game (one consumer, speculation); an OS-wide controller service (its own project).
- **Mapping: racing layout.** Left stick X sets the wheel's position (absolute, with a deadzone; back to centre on release). RT gas, LT brake, analog, with the arrows' direction rules (toward the gear's way is gas). A = Drive, B = Reverse, Y = Neutral, X = crab, Menu = Space (primary action, Park), View = restart. Rejected: the stick turning the wheel at a rate (sluggish on a pad).
- **Buttons reach games as their existing key codes.** `drive-frame` polls the pad each frame and calls the game's `onkeydown` with the matching key code on a press edge, so every game, the new ones too, gets it with no changes. Rejected: an `onaction` callback on every game (an API change while six games are mid-build).
- **Rumble:** a short strong pulse on a hit, light ticks with the parking sensor when close; a setting next to Sound; `vibrationActuator` is Chrome-only, so it gets a `compat/features.ts` entry.
- **Shell:** nothing (Drive Hub's rule: no commands).

## Action items
1. One build: `core/gamepad.ts`, `DriveInput` and `drive-frame` polling, the rumble setting, a "controller connected" hint, docs in `docs/apps/tight-spot.md` "Controls".
