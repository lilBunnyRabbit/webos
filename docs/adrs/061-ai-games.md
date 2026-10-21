# ADR-061: AI Games
**Date:** 2026-10-21
**Status:** Implemented

## Context
The first games that need on-device Gemini Nano (ADR-046): Unsaid (Taboo), Doodlehop (Sketch Guess) and Alibi. Nano is unavailable on phones, `extract()` is text-only, and every finished `prompt()` keeps a session from a pool of 4 shared by the whole OS. Ask already has an availability screen of its own. Discussion: [brainstorm](../brainstorm/2026-10-21_ai-games.md).

## Decision
- **Code owns the rules.** Word lists, cards, cases, banned-word checks, matching and verdicts are pure `.ts` with unit tests. The model only guesses (Unsaid, Doodlehop) or plays a suspect who never knows which statement is the lie (Alibi).
- **One kit gate.** A `$kit` component wraps any AI app: checking, unavailable (the requirements text), download notice, then the app. Ask moves onto it.
- **`extract()` takes images.** Content with an image part opens a `prompt-image` session with `expectedInputs` and the `responseConstraint`, destroyed after the call. Games that guess repeatedly never use `prompt()`, so they never evict kept chats. Alibi's interrogation is a chat and uses `prompt()`.
- **Phones:** the apps exist on phones and show the gate's unavailable state. No platform field in the manifest.
- **No dailies yet.** `track_play` and app storage only. Unsaid and Alibi take `{ seed?: number }`.
- **No shell commands.**

## Alternatives Considered
- Desktop-only manifest flag: hides dead tiles, but changes `define_app`. Deferred.
- `prompt()` with text parsing for image guesses: evicts other windows' chats on every guess.
- Kept base session plus `clone()`: faster guesses, new service API.
- Letting the model invent Alibi's case: inconsistent across turns, unverifiable, no seeds.

## Consequences
- AI games look broken on phones until a platform flag exists; the gate at least says why.
- Each Doodlehop guess pays for a new session; latency is the risk to measure.
- Image plus `responseConstraint` must be verified in Chrome before Doodlehop relies on it.

## Revision 2026-10-21

Platform pieces built. `AiGate` (`$kit/components/ai-gate`) takes `features`, `title`, `icon` and `download` (the notice text, so Ask keeps "The first question…"); its `children` snippet gets `{ availability, notice }`, where `notice` is the download strip as a snippet the app renders under its toolbar, or `null`. After one check at mount it follows the service's `features`, so the notice goes when a download finishes. `extract()` takes picture parts as decided; image plus `responseConstraint` is still unverified on a device with the model (the build machine's Chrome had no Prompt API).

## Revision 2026-10-21: Alibi

Built as decided ([app page](../apps/alibi.md)). The build settled the shape of a statement within scope: the player sees each one vague and in the first person ("I went home the usual way"), and the detail the lie hides comes out only by questioning. With the details on screen the cards could be matched without asking anything. Three templates of seven beats, six used per case; five cards (the one that breaks the lie, three that corroborate other statements, one red herring). Not yet played against Gemini Nano: the build machine's Chromium had no Prompt API.

## Revision 2026-10-21: Doodlehop

Built as decided ([app page](../apps/doodlehop.md)). Settled by the build within scope: strokes are kept in board units (a 1000-unit square) so a resized window keeps the drawing; the snapshot scales a small doodle up to 384 px and a large one down to 512 px, with the line width clamped so a blown-up doodle stays a pen line; Undo and Clear abort the guess already out, since it's about ink that is gone; a stroke still in its 700 ms idle when the clock ends is not sent; the recap saves at 1024 px, black on white, starting in `~/Pictures` when it exists (it isn't created by default) and `~/` otherwise. 184 words. Played only against a stubbed `LanguageModel`: image plus `responseConstraint` against the real model is still unverified.
