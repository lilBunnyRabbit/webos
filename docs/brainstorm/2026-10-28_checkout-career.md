# Checkout Challenge: career mode
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
LaxDOTexe sent a v2 design after playing the first cut ([2026-10-25](2026-10-25_checkout-challenge.md)), plus: "oh btw i think i want to remove the minute/day thing.. i still want days but i dont want a mimimum time limit". The design:

- **Customers** have names (same name → a number to tell them apart) and a trust meter shown as a health bar, plus their opinion of the shop in %. Right change and sales bring them back; trusted regulars come back to supply parties and events (a bigger sale). Wrong change loses trust.
- **Low-trust customers** make you type the change twice; get theirs wrong too often and they report you.
- **Police** then watch you serve. Blind mode: every typed digit shows as `*`, the decimal point stays. Everything goes red, a policeman stands behind the vexed customer, for an unknown number of customers. A mistake while watched means a day in jail; too many jail days and the shop is closed.
- **Typed list:** the customer's shopping list cascades down; type each price and press Enter, the item is crossed off and added to the total. No clicking items, no undo once Enter is pressed. Only when you give the total do you learn if you were right, and whether you were above or below.
- **Staff (bonus mode):** bought with shop money. For a short time only totals appear; type one, Enter, the next appears.
- **End of day:** the day's money goes into bills, stock and wages. Restock by typing item codes (43 = bread, shown next to its picture). No Enter: typing a listed code removes it; a wrong code shakes red, no penalty.
- **Warm-up before every shift** ("company policy"): keypad keys light green one at a time in random order until all ten digits are pressed, then the shop opens.

Today the game has one 60 s clock per day (`game.ts` `tick`), shop health with closures, Sorry tokens, tap-to-scan items, and only the best run saved (`app.checkout-challenge.best`).

## Decisions
- **First cut: everything at once.** All of the above ships in one build. Rejected: core loop first then staff and restock (owner wants the full vision), input-and-days only.
- **Replace the old rules.** Per-customer trust replaces shop health, jail days replace closures, Sorry tokens are removed. One game, no Classic mode. Achievements and the best run are re-pointed; achievements whose meaning no longer exists are redefined (ids kept where the meaning survives). Rejected: Classic and Career modes side by side (two rule sets to maintain).
- **Days without a clock.** A day is a fixed number of customers that grows with the day number (about 5 on day 1, capped near 12); it ends when the last one leaves. No timer anywhere. Rejected: player closes the shop (stars get fuzzy), a clock that pauses while typing.
- **Saved between days, in app storage.** The run (day, money, jail days, the customer roster with names and trust, staff, stock) is persisted with `storage.persisted` under `app.checkout-challenge.run`, a zod schema with `version`, written when each day (including the end-of-day stock and bills step) ends. Opening the app offers Continue or New shop. Mid-day state is not saved. Rejected: memory only (regulars mean nothing), save every sale (mid-sale schema).
- **Shell:** nothing, as before.
- **Mobile:** unchanged rule: the register keypad is real buttons, tapped on a phone, lit while typing on a keyboard. The warm-up lights those same keys.
- **Game tuning** (trust numbers, how many mistakes before a report, how long police watch, jail limit, staff price and length, bills and wages, codes per product) is the builder's first pass, tuned after play.

## Key takeaways
- Still typing practice: every new mode is a different typing drill (warm-up = key location, list = item prices, staff = totals, restock = code quick-dial, blind = no visual check).
- No new service, no dependency, no file format. One new app storage key.

## Action items
- [x] One app-builder agent: rules in `game.ts` (pure), state in `shop.svelte.ts`, UI per phase; update `docs/apps/checkout-challenge.md`.

## Next session topics
- Tune the economy after Lax plays it.
- Seeded daily, numpad-only mode (carried over).
