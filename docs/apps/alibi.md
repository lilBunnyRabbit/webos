# Alibi

Id `alibi` · Source: `src/lib/apps/user/alibi/` · [brainstorm](../brainstorm/2026-10-21_ai-games.md) · [ADR-061](../adrs/061-ai-games.md) · on [ADR-046](../adrs/046-on-device-ai-service.md)

## What it does

A detective game against Chrome's on-device model. A case has a brief, six first-person statements from the suspect and five evidence cards. The statements are vague on purpose ("I went home the usual way"); the details come out by questioning the suspect in free text. One detail is a lie, and exactly one card breaks it. The player accuses by pairing a statement with a card, two tries. Score is questions asked plus wrong accusations, lower is better. Desktop Chrome with Gemini Nano only: the app sits inside the kit's `AiGate`, so phones and other browsers get the unavailable screen.

## How it works

### Code owns the case, the model only talks

Everything that decides the game is pure code with tests: the case, which statement is false, which card breaks it, the verdict and the score. The model plays the suspect from a sheet that states the lie as fact. It never sees the evidence and never knows a lie exists, so no question ("which of your statements is false?", "what does the receipt say?") can make it give the answer away. The cost: the model can still invent a detail the sheet doesn't hold, which reads as a false contradiction; the sheet's rules push against that, nothing enforces it.

### Generator

`new_case(seed)` (`case.ts:59`), all randomness from `create_rng(seed)` (`$lib/core/utils/random`), so a seed is a case:

1. Pick one of three templates (`templates.ts`: the missing brooch at a gallery opening, the empty till at a bistro, the wiped backup drive at an office). Each has a brief, a suspect role with a job slot, venue slots, seven beats and three red herrings.
2. Shuffle 20 names: the first is the suspect, the next four are the cast that `"people"` beats draw from.
3. Drop one of the seven beats at random, keeping order: six statements.
4. Pick the lie among the six. For every beat pick the true value; the lie's claimed value is a different value from the same pool.
5. Cards: the lie's beat with its true value, three of the other five beats with their true values (they corroborate what the suspect will say), and one red herring that speaks to no statement. Shuffled.

A beat (`templates.ts`) holds:

| Field | What |
|-------|------|
| `claim` | The statement the player sees, first person, true whatever the value is |
| `sheet` | The detail as the suspect remembers it, second person, `{v}` for the value |
| `values` | Distinct values, each `{ sheet, card }` (how the suspect says it, how a record shows it: "your sister" vs the contact "Sister"), or `"people"` |
| `card` | Evidence title and text, `{v}` for the true value's `card` form |

Card texts avoid times that belong to other beats, so a corroborating card can't accidentally clash with another statement.

### Judging

`contradicts(statement, card)` (`case.ts:119`): the card speaks to the statement's beat and shows a value other than the one the suspect claims. `judge` applies it to a pick; `status` is solved after a right pick and lost after two wrong ones; `score` is questions plus wrong picks. `case.test.ts` runs 2,000 seeds and checks that exactly one statement contradicts exactly one card, that every beat of every template gets to be the lie, that no placeholder is left, and that the suspect sheet holds the lie, not the truth and no card text.

### Suspect sheet

`suspect_prompt(game)` (`case.ts:152`) is the system message: persona (name, role, the brief), the six details with the lie stated as fact, and rules: one or two sentences in first person, answer listed things plainly, anything unlisted is "don't remember" with no invented times, names or places, no comment on evidence, records or witnesses, never say a listed thing is untrue.

Questions go through `ai.prompt()` with the system message plus the whole transcript, so the service reuses the kept session while the conversation continues and rebuilds it from the transcript after a reload. Answers stream into the transcript; Stop (or Esc) aborts through the service. A stopped answer keeps what streamed and counts as a question; one stopped before any text is dropped and doesn't count.

### UI

Game app frame: toolbar with the case title, `Case NNNN` and New case (F2); the case file (brief, statements, evidence, Accuse and the status line) beside the interrogation from `@2xl`, stacked and scrolling as one column below it; the question box pinned above the status bar. Statements and cards are toggle buttons (`aria-pressed`). A `BoardOverlay` over the interrogation starts the case and ends it (score line, Transcript, New case); at the end the lie is marked, its card flagged, and both versions of the detail shown.

## Data

| What | Where |
|------|-------|
| Case in progress or last finished | `app.alibi.case`: `{ seed, transcript: [{ role, content, stopped? }], picks: [{ statement, card }] }`, zod-checked on load (`saved_schema`, `case.ts:174`). The case itself is rebuilt from the seed |
| Play time | `track_play` into `/var/lib/games/plays.json` |
| Cases closed in all | `app.alibi.closed`, for the `cases-10` achievement |
| Achievements | `/var/lib/apps/alibi/achievements.json`, written by the OS ([achievements](../system/services/achievements.md)) |

Written only once the case has a question or an accusation, so opening a `seed` link doesn't replace a saved case until it's played. New case clears it. Props: `{ seed?: number }` opens that case; with a saved case of the same seed it resumes. No daily, no shell commands (ADR-061).

**Achievements** (ADR-078), reported from `accuse()` when the accusation solves the case (a lost case earns nothing): `first-case`, `clean` (no wrong accusation), `few-questions` (3 answered questions or fewer, `answered_in`: a question still waiting for its first word when the case closes is dropped from the transcript, so it doesn't count), `cases-10` (progress: `app.alibi.closed`), secret `silent` (no answered question).

## Dependencies & licences

None beyond the AI service. Templates, names and texts are written for WebOS.

## Limits

- Not played against the real model: the build machine's Chromium has no Prompt API. The UI was driven against a stubbed `LanguageModel`; how well Gemini Nano keeps to the sheet (invented details, refusing to answer, breaking character) is unmeasured.
- Three templates of seven beats: cases repeat in shape quickly.
- A long interrogation can outgrow the model's context window; the error is shown, there is no meter.
- Two windows of Alibi share one save; the last to write wins.

## Decisions

- [ADR-078](../adrs/078-achievements.md): achievements.
- [AI games brainstorm](../brainstorm/2026-10-21_ai-games.md), section Alibi
- [ADR-061](../adrs/061-ai-games.md), with the 2026-10-21 Alibi revision note
