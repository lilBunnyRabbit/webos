# AI-native apps (ideas)

**Date:** 2026-10-20
**Participants:** owner, Claude (research subagent)

## Context

The owner asked for apps that couldn't exist without Gemini Nano: AI-native apps, not existing apps with an AI button. Limits: desktop Chrome only, a few thousand tokens of context, one constrained step at a time, text and image input. No decisions yet; this is a list to pick from.

## Topics discussed

| Idea | Pitch | How it fits Nano | Size |
|------|-------|------------------|------|
| Taboo | Describe a word without the banned ones; the AI guesses | One short turn per clue; JS owns the word and the rules | S |
| Twenty Questions | The AI holds a secret and answers yes, no, sometimes or unknown | Secret in the system prompt, answer from an enum | S |
| Sketch Guess | Pictionary: you draw, the AI guesses | One canvas snapshot per call, `{ guess, close }` | M |
| Alibi | Question a suspect, find the lie | JS generates the case and scores the accusation; the model only plays the part | M |
| Pocket Dungeon | Text adventure: JS engine plus AI parser and narrator | Free text into `{ verb, target }` enums; short streamed narration | L |
| Emoji Rebus | Guess a film or proverb from emoji, or make one | Tiny turns; could be a Game Hub daily | S |
| Café Talk | Role-play language practice with corrections | One scene per session; needs the Proofreader API (new) | M |
| Voice Inbox | Speak a thought; it's filed as todo, idea or event | Needs audio input (new) | M |
| Night Journal | Private diary that asks one follow-up question | One entry per call; weekly digest summarizes summaries | M |
| Photo Bingo | Scavenger hunt checked by the webcam | One image, yes or no | M |
| Receipt Box | Receipt photo to a spending CSV | Schema plus a JS check that the items add up to the total | M |
| Whiteboard Snap | Photo of a board to clean Markdown | One image, plain output | S |
| Quiz Me | A text file becomes a multiple-choice quiz | One chunk per call | M |
| Tone Dial | Rewrite with sliders for formality, length, warmth | Needs Writer/Rewriter (new) | S |

Research pick: Taboo (most fun for the least code, needs only `extract`), Sketch Guess (most "couldn't exist without it", uses image input), Pocket Dungeon (model as parser and narrator, deterministic engine as the truth; a later wave).

## Key takeaways

- Against ADR-054's direction, some ideas sit close to "AI bolted on": Quiz Me and Tone Dial could be shell filters, Receipt Box and Whiteboard Snap overlap the photo reading in Shopping List, Journal and Voice Inbox should expose read commands for Ask.
- None works on phones. AI-only apps need an owner call: desktop-only, or shown with Ask's unavailable state.
- Audio input and the Writer, Rewriter and Proofreader APIs would be AiService changes (ADR-046 revisions).

## Action items

- Owner picks any to build; each gets the usual grill, including its shell question.

## Next session topics

- Whether AI-only apps may be desktop-only.
