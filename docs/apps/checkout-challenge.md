# Checkout Challenge

Id `checkout-challenge` · Source: `src/lib/apps/user/checkout-challenge/` · Brainstorms: [first cut](../brainstorm/2026-10-25_checkout-challenge.md), [career mode](../brainstorm/2026-10-28_checkout-career.md) · idea from LaxDOTexe

## What it does

Number typing practice dressed as a shop you run day after day. Every shift starts with a warm-up on the keypad. Customers step up with a shopping list; the player types each price and presses Enter, then gives the total, and only then learns whether it was right, or how much over or short. Customers have names and remember: right change earns their trust, wrong change loses it, and a customer whose trust keeps sinking calls the police. While the police watch, the register goes red and typing is blind; a slip means a night in jail, and three of those close the shop. Staff, bought with the shop's cash, ring up lists for a few customers so only the total is typed. At closing the day's money goes to wages, bills and stock, and the shelves are restocked by typing product codes. The shop is saved between days.

Any digit keys count (top row and numpad, with or without NumLock), `.` (or `,`), Backspace and Enter; H hires staff. The register's keypad is real buttons: it lights up as you type on a keyboard and is tapped on a phone, and the warm-up lights the key to press.

## How it works

All rules are pure functions over one immutable `Run` in `game.ts`; `shop.svelte.ts` holds the run in `$state.raw`, routes a key to the phase that takes it, and fires three events on phase changes: `on_end` (the day is over, → `DAY_OVER` or → `GAME_OVER`; the component records the day's stats, achievements and best run), `on_close` (→ `DAY_OVER`, and again when the sale switch flips; the component saves the run) and `on_lost` (→ `GAME_OVER`). Recording and saving happen at the same moment, after the restock, so closing the window during the restock drops the whole day, its jailing included, and nothing is counted twice. The component drives `tick(run, dt)` from a `requestAnimationFrame` loop (`checkout-challenge.app.svelte:152`, frame time capped at 100 ms) while the window is focused and visible.

### Phases

| Phase | What happens | Keys |
|-------|--------------|------|
| `READY` | Title; with a saved shop, Continue or New shop | Enter: Continue / Open the shop |
| `WARMUP` (`begin_day`, `warm_key`) | The ten digits in a shuffled order; the next one lights green, a wrong key wiggles the display (no penalty). The tenth opens the shop | digits |
| `OPEN` (`tick`, `enter`) | Customers, one at a time | digits, `.`, Backspace, Enter, H |
| `RESTOCK` (`end_day`, `restock_key`) | The day's books, then a tile per product sold today with its code | digits |
| `DAY_OVER` | Stars, the books, the "Sale tomorrow" switch; the day is recorded and the run saved here | Enter: open the next day |
| `GAME_OVER` | The shop is closed (`MAX_JAIL_DAYS` nights in jail); the save is removed | Enter: New shop |

### The day: no clock

There is no timer. A day is `day_customers(day)` customers: `FIRST_CUSTOMERS` (5) on day 1, one more each day, at most `MAX_CUSTOMERS` (12). The clock in the run only paces the walk in (`ARRIVAL_MS`, `STAFF_ARRIVAL_MS` while staff work) and out (`LEAVE_MS`, long enough to read the result) and the flashes. The day ends when the last customer has left, or at once after a jailing.

### A customer (`arrive`, `enter`, `settle`)

1. **The list.** Items drop in one after another (`cc-drop`, 80 ms apart). Stage `ITEMS`: the current line is highlighted; the typed amount and Enter record it as `entered`, cross the line off and add it to the shown running total, which is the sum of what was entered, not of the prices. There is no undo after Enter and nothing to click. An Enter with nothing typed does nothing.
2. **The total.** Stage `TOTAL`: the player types the total and presses Enter.
3. **Once more.** A customer who stepped up with trust under `LOW_TRUST` (35) is `doubting`: stage `CONFIRM` asks for the total again. If the first one was wrong, that one counts.
4. **The result.** Right when the given total equals the list's real total (`list_total`); otherwise the register says `x over` or `x short`, shows the real total, and marks each line whose entry was wrong.

| Result | Trust | Money | Stock | Mood |
|--------|-------|-------|-------|------|
| Right | +`TRUST_GAIN` (8), +`SALE_TRUST_BONUS` (4) on a sale day, at most 100 | + the total | each item −1, `STOCK_SHARE` (40 %) of the total to the day's stock cost | happy |
| Wrong | −`TRUST_LOSS` (25), at least 0; a strike when that leaves trust below `LOW_TRUST` | none | none | sad, or vexed when the police are there |

Amounts compare as cents, so `7`, `7.0` and `7.00` are the same (`parse_amount`). Typing keeps one dot, two decimals and nine characters (`append_key`).

### Customers and trust (`choose_patron`)

The run keeps a roster of patrons: name, `tag`, look, trust (0 to 100, shown as a bar and as their opinion of the shop in %), visits and strikes. New patrons start at `START_TRUST` (60).

- **Coming back.** Each arrival is a returning patron with `RETURN_CHANCE` (35 %), `+SALE_RETURN_BONUS` (25 %) on a sale day, when anyone is eligible: patrons with trust above 0 who haven't come in today. Who comes is weighted by `0.25 + trust/100`, so trusted regulars come back most. Otherwise a new patron walks in.
- **Names.** Picked from `NAMES`. When a name is already on the roster, the newcomer and any untagged namesake get a random two-digit number (`Mia #47`), unique per name.
- **Party orders.** A returning patron with trust ≥ `PARTY_TRUST` (80) brings a party order with `PARTY_CHANCE` (40 %): `PARTY_EXTRA_MIN`–`PARTY_EXTRA_MAX` (3–5) more items, at most 10, and a confetti mark by the name.
- **Leaving for good.** A patron at trust 0 is dropped from the roster at the end of the day. The roster holds `MAX_ROSTER` (30); a newcomer past that replaces the least trusted patron not seen today.

### The police and jail

Every wrong total that leaves a patron's trust below `LOW_TRUST` is a strike, whether or not they came in doubting, and right totals in between don't clear strikes. A patron who collects `REPORT_STRIKES` (2) calls the police; their strikes reset. From `START_TRUST` that takes three wrong totals (60 → 35 → 10, strike → 0, strike), or three with right ones in between (60 → 35 → 43 → 18, strike → … → below 35 again, strike), so a sloppy player meets the police within a few days. The police then watch the next `POLICE_MIN`–`POLICE_MAX` (2–5) customers; the number is in the run (`police_left`) but never shown. A watch that outlasts the day carries into the next one and is saved with the run. While they watch:

- the board turns red (`error` token tint and ring), a "Police watching" tag shows, the policeman (`police.svelte`, the `info` token) stands behind the customer, and every customer is vexed;
- blind mode: the display and the running total show each digit as `*` and keep the decimal point (`mask`), and the keypad doesn't light the digit keys typed on a keyboard;
- a right total counts down the watch; the last one sends the police away (`today.cleared`, the Clean record achievement);
- a wrong total is a night in jail: `jail_days` +1 and the shop shuts for the rest of the day. The books and restock still run. At `MAX_JAIL_DAYS` (3) the shop is closed and the run is over.

### Staff (`hire_staff`)

The Staff button (or H) costs `staff_price(day)`: `STAFF_SHARE` (1×) the day's item price cap, rounded to a whole unit (9.00 on day 1). It is paid at once from cash and booked as wages. It needs the cash, no staff already working, and customers still to come. The next `STAFF_CUSTOMERS` (4) customers arrive with their list already entered at the right prices (stage `TOTAL`, "Staff rang up") and come in quicker; only the total is typed. Staff hired late keep working into the next day until they've rung up all four (`staff_left`, saved with the run). Doubting customers still ask twice, and the police still watch.

### Closing up: the books and restock

When the day ends, `end_day` books it:

| Line | Amount |
|------|--------|
| Takings | Money from right totals today |
| Wages | Staff hired today (already paid) |
| Bills | `bills(day)`: `BILLS_SHARE` (1.2×) the day's item price cap, rounded to a whole unit |
| Stock | `STOCK_SHARE` of the takings |
| Profit | Takings − wages − bills − stock |

Bills and stock come out of the cash then, which can go below zero; nothing else happens at a negative balance. Each product starts at `STOCK_FULL` (8) and customers' baskets only take products still on the shelf. Every product sold today shows as a tile with its picture and its two-digit code (`PRODUCT_CODES`, 43 is bread). Typing a listed code refills that product and clears its tile; no Enter. A digit that can't start any listed code clears the input and wiggles it red, with no penalty. With every tile cleared the day is over and saved. A day with nothing sold skips straight to `DAY_OVER`.

### Sale day

The `DAY_OVER` screen has a "Sale tomorrow" switch (`toggle_sale`). On a sale day every price is `SALE_DISCOUNT` (20 %) lower, more regulars come back and right totals earn more trust. The switch is saved with the run.

### Difficulty (`difficulty`)

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

Whole-number days show amounts without decimals; from day 3 every amount has two.

### Stars (`stars`)

Accuracy = right ÷ served. ≥ 95 % three stars, ≥ 80 % two, ≥ 60 % one, otherwise none; nobody served, none; a day that ended in jail, at most one.

### Keys and focus

`typed_key` (`checkout-challenge.app.svelte:207`) reads digits from `event.code` (`Digit*`, `Numpad*`) so the numpad works with NumLock off and the top row works on AZERTY without Shift. Keys count only when the board has focus; buttons inside it don't take focus on mouse down (`keep_focus`, `:203`), because the keypad turns disabled between customers and a disabled button drops focus to the page.

### Tuning constants

All in `game.ts`; a first pass, to be tuned after play.

| Constant | Value | Meaning |
|----------|-------|---------|
| `FIRST_CUSTOMERS`, `MAX_CUSTOMERS` | 5, 12 | Customers on day 1, and the cap (+1 a day) |
| `ARRIVAL_MS`, `STAFF_ARRIVAL_MS`, `LEAVE_MS` | 700, 150, 1800 ms | Gaps between customers; time to read the result |
| `START_TRUST`, `MAX_TRUST` | 60, 100 | A new patron's trust; the top |
| `TRUST_GAIN`, `SALE_TRUST_BONUS`, `TRUST_LOSS` | 8, 4, 25 | Trust per right total, extra on a sale day, lost per wrong one |
| `LOW_TRUST` | 35 | Below it a customer asks for the total twice; a wrong total that lands below it is a strike |
| `RETURN_CHANCE`, `SALE_RETURN_BONUS` | 0.35, 0.25 | Chance an arrival is a regular |
| `PARTY_TRUST`, `PARTY_CHANCE`, `PARTY_EXTRA_MIN`–`MAX` | 80, 0.4, 3–5 | Party orders |
| `MAX_ROSTER` | 30 | Patrons remembered |
| `REPORT_STRIKES` | 2 | Strikes before a call to the police |
| `POLICE_MIN`, `POLICE_MAX` | 2, 5 | Customers watched |
| `MAX_JAIL_DAYS` | 3 | Nights in jail that close the shop |
| `STAFF_CUSTOMERS`, `STAFF_SHARE` | 4, 1 | Customers staff ring up; their price as a share of the day's item cap |
| `BILLS_SHARE` | 1.2 | Bills as a share of the day's item cap |
| `STOCK_SHARE`, `STOCK_FULL` | 0.4, 8 | Restock cost per sale; units per product |
| `SALE_DISCOUNT` | 0.2 | Price cut on a sale day |

## Data

- `app.checkout-challenge.run` (localStorage, app storage): the shop between days, `saved_run_schema` with `version: 1`: day, cash (cents, may be negative), jail days, days survived, the sale switch, run totals, the roster, the next patron id, stock, and `staff_left` and `police_left` (customers still owed by staff and still under police watch; added after the first saves, so `.default(0)` reads an older save as none, without a version bump). Written by `on_close` when a day's restock is done (and when the sale switch flips); read by Continue (`load_run`, back at that day's end, then the next day's warm-up). Nothing mid-day: closing the window during a day loses that day. Removed by New shop and when the shop is closed.
- `app.checkout-challenge.best`: the best run `{ money, days, accuracy }`, `best_run_schema`. Money is cash in hand (at least 0); best = most money, more days breaks a tie. Compared when a day is over (after its restock, or when the shop closes).
- `app.checkout-challenge.sales`: customers served in all, every shop added up, for `sales-500`.
- `/var/lib/apps/checkout-challenge/achievements.json`: achievements, written by the OS ([achievements](../system/services/achievements.md)).
- `/var/lib/games/plays.json`: play time and sessions through `track_play` (Game Hub).
- No props, no shell commands (`app launch checkout-challenge`), no files.

Two windows of the app share the saved run's cell; each plays its own day and the last to close a day wins.

**Achievements** (ADR-078), reported from `record_day()` when a day is over (after its restock, or when the shop closes): `first-day` (a day without jail), `three-stars`, `days-7` (progress: days survived this shop), `money-1000` (progress: this shop's takings in whole units), `sales-500` (progress: customers served in all), `party` (a party order right), `best-friend` (a patron at 100 % trust), secret `clean-record` (the police left without a slip), secret `spotless` (`spotless_day`: day 5 or later, out of jail, customers served and none wrong). `first-day`, `three-stars`, `days-7`, `money-1000`, `sales-500` and `spotless` keep their ids from the first rules; their text follows the new ones.

## Dependencies & licences

None beyond the repo's. Item pictures are Phosphor icons; the customers (`customer.svelte`) and the policeman (`police.svelte`) are drawn in SVG.

## Limits

- The balancing numbers are a first pass and unplayed by real users.
- Customers have no patience: an idle player loses nothing but time.
- Cash can go negative with nothing to stop it; only jail ends a shop.
- No seeded daily, no numpad-only mode (brainstorm, next topics).

## Decisions

- [ADR-078](../adrs/078-achievements.md): achievements.
- [2026-10-25 brainstorm](../brainstorm/2026-10-25_checkout-challenge.md): any digit keys, real keypad buttons on both platforms, best run in app storage, no shell commands.
- [2026-10-28 brainstorm](../brainstorm/2026-10-28_checkout-career.md): career mode replaces the first rules, everything in one cut, days by customer count with no clock, the run saved between days under one app storage key.
