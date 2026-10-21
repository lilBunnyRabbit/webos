# Unsaid

Id `unsaid` · Source: `src/lib/apps/user/unsaid/` · [brainstorm](../brainstorm/2026-10-21_ai-games.md) · [ADR-061](../adrs/061-ai-games.md) · on-device AI: [ADR-046](../adrs/046-on-device-ai-service.md)

## What it does

Taboo against Gemini Nano. A round is 5 cards. Each card has a word, a category and five banned words. The player types clues and the AI on this device guesses after each one. Every clue costs a point, a pass costs 3, and a low round is a good one. Untimed, one player, no daily.

## How it works

Code owns every rule: the deck, the banned-word check, matching and scoring are plain TypeScript in `words.ts` and `round.ts`, with Node tests. The model only guesses.

### Cards

`cards.ts` holds 150 hand-written cards, 25 in each of six categories (`card.ts`), in our own wording. Targets and banned words are single lowercase words; a deck test checks that, plus five distinct banned words per card, none of them sharing the target's stem. The deck is a dynamic `import()` in the app, so it's its own chunk.

`deal(seed, deck)` shuffles a copy with `create_rng(seed)` and takes the first 5. A seed replays the same cards for as long as the deck is unchanged; editing `cards.ts` changes what old seeds deal.

### Words and stems (`words.ts`)

- **Fold:** NFKD, strip combining marks, lowercase. `Pöny` is `pony`.
- **Tokens:** runs of letters (`\p{L}`), so spaces, digits, hyphens and apostrophes all split. Each token keeps its offsets in the typed text, for highlighting.
- **Stem:** one suffix off, the first that fits from `ies → y`, `ing`, `es`, `ed`, `er`, `ly`, `s`, only when 3 or more letters are left; then a final `e` and a doubled last letter are dropped (when more than 3 letters remain). So `bake`, `baked`, `baker`, `baking` all stem to `bak`, `run` and `running` to `run`, `fly` and `flies` to `fly`.

### The banned-word check

A clue token is banned when it equals a card word (target or banned), when its stem equals that word's stem, or when it starts with the card word or its stem and that prefix has 4 or more letters (`horse` bans `horseshoe`; `bed` doesn't ban `bedroom`). The prefix rule catches what the cheap stemmer misses (`strings` against `string`, `cookies` against `cookie`).

A clue with any violation can't be sent: Send is disabled and a strip under the field repeats the clue with each offending word marked in `error`, naming the card words it matched. It never reaches the model.

### Prompt protocol

After each allowed clue there's exactly one `ai.extract()` call (a fresh session, destroyed after, so it never evicts another window's chat):

- **System:** play Taboo; the other player describes one secret word and never says it; give up to three different single-word guesses, most likely first; never repeat a wrong guess.
- **User:** `Clues so far:` with every clue on this card numbered, then `Wrong guesses so far (never guess these again): …` once there are any, then `Guess the word.`
- **Schema:** `{ guesses: string[] }`, 1 to 3 items of 1 to 30 characters, sent as `responseConstraint` and validated on the way back.

The target and its banned list are never in the messages; a test asserts it. Wrong guesses are every guess on this card that missed, once each by `guess_key` (folded, articles dropped), oldest first.

The clue only counts once the model answered. A failed call leaves the clue in the field and shows the error; Stop (or Esc) aborts the call. Passing or starting a new round aborts it too.

### Hits

A guess hits when any of its tokens, articles (`a`, `an`, `the`) skipped, equals the target or has the target's stem. `The frog` and `frogs` hit `frog`; `full moon` hits `moon`; `honeymoon` doesn't. The hit guess is shown in `success`.

### Score

Per card: clues used, plus 3 when passed. The round is the sum. The best (lowest) round is kept in app storage.

## Data

- `app.unsaid.best`: the lowest round score, or `null`.
- Play time through `track_play` in `/var/lib/games/plays.json` (ADR-035). No daily.
- Props: `{ seed?: number }` deals that round. The end screen copies a solo link with the round's seed.
- A round in progress isn't saved: closing the window drops it.

## Dependencies & licences

None beyond the AI service and zod.

## Limits

- The stemmer is English-only and cheap: irregular forms (`mice`/`mouse`, `ran`/`run`) pass the check, and the 4-letter prefix rule can block innocent words (`star` blocks `start`).
- Guess quality, latency and whether Nano honours "never repeat" were not measured: the build machine's Chromium has no Prompt API, so the flow was checked with a stubbed `LanguageModel` only.
- Phones show the gate's unavailable screen (ADR-061); the layout was checked at 390 px through a solo link with the stub.

## Decisions

- [AI games brainstorm](../brainstorm/2026-10-21_ai-games.md): rounds of 5, untimed, code-owned banned words, the name.
- [ADR-061](../adrs/061-ai-games.md): code owns the rules, the kit `AiGate`, `extract()` for repeated guesses, no dailies, no shell commands.
