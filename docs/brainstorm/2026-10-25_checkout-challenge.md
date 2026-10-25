# Checkout Challenge
**Date:** 2026-10-25
**Participants:** owner, Claude

## Context
LaxDOTexe (proposal "Numlock Practice"): "I want to practice my num-lock number skills." Customers come to your shop; you click their items to scan them, type the price on the numpad, Enter confirms the sale and the next customer steps up. Wrong prices cost health; a low health bar means fewer, stingier customers and, emptied too many times, the shop closes. "Sorry" tokens, earned by accurate sales, let you retype for half damage. Days last one minute and end with a star rating. ✗ lamp lights red on a mistake, ✓ green when right; faces go :) right first time, :| after a sorry, :( on a mistake. Phone: "no". Feel: "positive and fun". Name: "Checkout Challenge". A sketch (customer, register with ✗/✓ lamps, price screen and keypad, vertical health bar, Sorry button) was a private input.

Today: 29 games; Lunar Lander is the pattern (`track_play` from `$kit/games`, best scores in app storage). Game Hub counts plays from `/var/lib/games/plays.json`. No typing game exists.

## Decisions
- **New app** `checkout-challenge`, "Checkout Challenge", category Games. Authors: LaxDOTexe, owner.
- **Keys:** any digit counts (top row and numpad), `.` and Enter (owner picked "Any digits" over numpad-only). Rejected: numpad only with toggle (laptops can't play by default), numpad only (laptops can't play at all).
- **Typing:** scanning an item adds a line to a receipt with a running total; the player copies the shown total exactly. Pure typing practice; difficulty grows through more items and longer totals. Rejected: mental sum (turns it into arithmetic), mode switch (two rule sets).
- **Mobile:** the register's keypad is real buttons. On desktop it lights up as you type; on a phone you tap it. Items are tapped to scan either way. Rejected: desktop only (breaks the both-platforms rule), a "needs a numpad" message.
- **Saved:** `track_play(app_id)` so Game Hub counts plays; best run (money, days survived, accuracy) in `app.checkout-challenge.best`. No daily. Rejected: seeded daily (needs a seeded customer RNG; later), nothing saved.
- **Shell:** nothing. `app launch checkout-challenge` covers it. Rejected: a `checkout best` command, a mode prop.
- **First cut:** the full loop from the proposal: scanning, typing, ✓/✗ lamps, faces, health bar, Sorry tokens (earned by accurate sales; a Sorry forgives half the damage and allows a retype, it has to be clicked first), one-minute days with money and an end-of-day star rating, more and pricier customers at high health, fewer at low health, three closures end the game, best run. Balancing numbers are the builder's first pass, tuned after play.

## Key takeaways
- Practice tool dressed as a game: accuracy and speed are the skill, the economy is the reward loop.
- No new service, no dependency, no file format.

## Action items
- [x] Build with one app-builder agent; docs page `docs/apps/checkout-challenge.md` for the economy model (health, customer rate, spend, Sorry, stars, closures).

## Next session topics
- Tune the economy after play.
- Seeded daily in Game Hub.
- Numpad-only mode for strict practice.
