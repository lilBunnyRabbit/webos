# Checkout Challenge

Id `checkout-challenge` · Source: `src/lib/apps/user/checkout-challenge/` · [Brainstorm](../brainstorm/2026-10-25_checkout-challenge.md) · idea from LaxDOTexe

## What it does

Number typing practice dressed as a shop. Customers step up with items; the player taps each item to scan it, which adds a line and a running total to the receipt, then types the shown total exactly and presses Enter. Any digit keys count (top row or numpad, with or without NumLock), `.` (or `,`), Backspace and Enter. The register's keypad is real buttons: it lights up as you type on a keyboard and is tapped on a phone. A wrong total costs the shop health; a Sorry token lets you retype it for half. Days last one minute and end with the day's money and 0 to 3 stars. Three closures and the shop is lost.

## How it works

All rules are pure functions over one immutable `Run` in `game.ts`; `shop.svelte.ts` holds the run in `$state.raw` and the component drives it with a `requestAnimationFrame` loop (`checkout-challenge.app.svelte:112`) that calls `tick(run, dt)` with the frame time capped at 100 ms. The loop only runs while a day is open, not paused, and the window is focused and visible; losing focus pauses the day (`:101`), as Lunar Lander does.

### The day (`tick`, `game.ts:276`)

The game clock runs from 0 to `DAY_MS` (60 s). One customer stands at the counter at a time. The first arrives `FIRST_ARRIVAL_MS` after opening; when a customer leaves (`LEAVE_MS` after the sale settles, long enough to see the face and the lamp), the next is due after `arrival_gap`. Past 60 s no one new comes in, the customer at the counter is still served ("Closing time!"), and the day ends when the counter is empty.

### A sale (`enter`, `game.ts:334`)

| Typed total | Customer stage | Result | Face | Health | Money |
|-------------|----------------|--------|------|--------|-------|
| Right | ringing | clean sale, ✓ lamp | :) | +`SALE_HEAL` (3) | the total |
| Wrong, a Sorry token in hand | ringing | disputed, ✗ lamp, waits `DISPUTE_MS` (4 s) | :( | – | – |
| Wrong, no token | ringing | mistake, ✗ lamp | :( | −`MISTAKE_DAMAGE` (24) | 0 |
| (Sorry clicked or S) | disputed | token spent, screen cleared, retype | :\| | – | – |
| (Enter, "Let it go", or the 4 s run out) | disputed | mistake | :( | −24 | 0 |
| Right | retyping | sorry sale, ✓ lamp | :\| | −`SORRY_DAMAGE` (12) | the total |
| Wrong | retyping | mistake | :( | −24 | 0 |

Enter with items still on the counter does nothing but wiggle them ("You missed something!"); it isn't a mistake. Amounts compare as cents, so `7`, `7.0` and `7.00` are the same answer (`parse_amount`, `game.ts:197`). Typing keeps one dot, two decimals and nine characters (`append_key`).

### Sorry tokens

A run starts with `START_SORRY` (1). Every `STREAK_FOR_SORRY` (5) clean sales in a row earn one, up to `MAX_SORRY` (3). A dispute, a sorry sale or a mistake resets the streak. The token has to be spent before the retype: it's the only way to fix a total after Enter. A typo caught before Enter is just Backspace.

### Health, customers and spend

Health runs 0 to `MAX_HEALTH` (100) and carries from day to day. It sets how busy and how generous the shop is:

| | Formula | At 100 | At 25 |
|---|---------|--------|-------|
| `spend(health)` | 0.55 + 0.45 × health/100 | 1.0 | 0.66 |
| Item count | random between the day's minimum and minimum + (max − min) × spend | full range | the cheaper half |
| Price cap | the day's cap × spend | full | two thirds |
| `arrival_gap` | 4.2 s → 0.9 s by health, × 0.75–1.25 jitter | ~0.9 s | ~3.4 s |

So a shop that keeps making mistakes gets fewer customers with smaller baskets, earns less, and has fewer chances to heal.

### Closures

Health reaching 0 closes the shop for the rest of the day: the customer at the counter leaves, the day ends early (at most one star) and counts a closure. The next day opens at full health. `MAX_CLOSURES` (3) closures lose the shop and end the run. Days survived counts every day that ended with the shop still in business.

### Difficulty (`difficulty`, `game.ts:136`)

| Day | Items per customer | Prices | Cap per item |
|-----|--------------------|--------|--------------|
| 1 | 1–2 | whole, from 1 | 9 |
| 2 | 1–2 | whole | 19 |
| 3 | 1–3 | with cents, from 0.50 | 9.99 |
| 4 | 2–3 | cents | 19.99 |
| 5–6 | 2–4 | cents | 49.99 |
| 7–8 | 3–5 | cents | 99.99 |
| 9–10 | 3–6, then 4–6 | cents | 199.99, 299.99 |
| 11+ | 4–7 | cents | +100 a day, at most 999.99 |

Whole-number days show totals without decimals; from day 3 every amount has two.

### Stars (`stars`, `game.ts:225`)

Accuracy = (clean + sorry ÷ 2) ÷ sales. ≥ 95 % three stars, ≥ 80 % two, ≥ 60 % one, otherwise none; no sales, none; a day that closed early, at most one.

### Keys and focus

`typed_key` (`checkout-challenge.app.svelte:147`) reads digits from `event.code` (`Digit*`, `Numpad*`) so the numpad works with NumLock off and the top row works on AZERTY without Shift. Space scans the next item, S says sorry, P or Escape pauses. Keys count only when the board has focus; buttons inside it don't take focus on mouse down (`keep_focus`, `:143`), because a scanned item or the keypad turns disabled mid-sale and a disabled button drops focus to the page.

## Data

- `app.checkout-challenge.best` (localStorage, app storage): the best run `{ money, days, accuracy }`, money in cents, validated by `best_run_schema`. Best = most money, more days breaks a tie. Updated whenever a day ends, so a run abandoned mid-way still counts what it earned.
- `app.checkout-challenge.sales`: sales rung up in all, every run added up, for the `sales-500` achievement.
- `/var/lib/apps/checkout-challenge/achievements.json`: achievements, written by the OS ([achievements](../system/services/achievements.md)).
- `/var/lib/games/plays.json`: play time and sessions through `track_play` (Game Hub).
- No props, no shell commands (`app launch checkout-challenge`), no files.

**Achievements** (ADR-078), reported from `record_day()` whenever a day ends, before the best run is compared: `first-day` (a day that didn't close early), `three-stars` (three stars for the day), `days-7` (progress: days survived this run), `money-1000` (progress: this run's money in whole units), `sales-500` (progress: the running total above), secret `spotless` (`spotless_day`, `game.ts`: day 5 or later, open to the end, sales and no sorry or mistake).

## Dependencies & licences

None beyond the repo's. Item pictures are Phosphor icons; the customers are drawn in `customer.svelte`.

## Limits

- The balancing numbers are a first pass and unplayed by real users; the brainstorm lists tuning after play.
- Customers have no patience: an idle player loses nothing but time.
- No seeded daily, no numpad-only mode (brainstorm, next topics).

## Decisions

- [ADR-078](../adrs/078-achievements.md): achievements.
- [2026-10-25 brainstorm](../brainstorm/2026-10-25_checkout-challenge.md): any digit keys, copy the shown total rather than sum it, real keypad buttons on both platforms, best run in app storage, no shell commands.
