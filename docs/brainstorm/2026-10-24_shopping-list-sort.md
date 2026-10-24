# Shopping List: sort and date added
**Date:** 2026-10-24
**Participants:** owner, Claude

## Context
Owner: "For the shopping list i want to sort the items asc/desc by date added and name - i want to see when the item was added".

Today items show in the order they were added (array order, oldest first), with no sort. Items carry no added date, but `new_id()` (`data.ts:92`) starts every id with the creation time in base 36, and a share keeps ids. Re-adding a name already on the list (open or ticked) reuses that item (`items.ts:9`). View state lives in window storage (`list`, `store`, `cart_open`).

## Decisions
- **Date source:** a new `added_at` field on the item, not the id. Rejected: reading the time from the id (no format change, but the meaning hides in the id format).
- **Schema:** `added_at: z.number()`, required. Loading fills it for items saved before it (from the id's time, else `updated_at`), and an incoming share fills it the same way, so no reader handles a missing date. File stays version 1. Rejected: optional forever (the fallback in every reader).
- **Re-add:** keeps the first date; the add path doesn't change. Rejected: a ticked item restarting its date (new id plus a delete, which shows on the other phone).
- **Sort:** a Sort section in the list's ⋯ menu with Oldest first, Newest first, Name A–Z, Name Z–A, a tick on the current one. Window storage `sort`, default Oldest first (today's order). Applies to every list, All, and "In the cart". Rejected: a toolbar button (owner wants a sparse toolbar), per list in the file (format change, share review noise).
- **Showing the date:** only in the item editor, "Added yesterday, 18:04" under the name. Owner: "i want to see it only if i want" and "not see it for all items". Rejected: a muted line under every row, a ⋯ "Show dates" toggle, the row menu.
- **Shell:** nothing.

## Key takeaways
- Dates exist for every old item through the backfill, so sorting by date works on day one.

## Action items
- [x] Build: `added_at` with backfill, sort menu, date in the editor, docs/apps/shopping-list.md, changelog.

## Build notes (2026-10-24)
- Schema: `added_at` optional on the way in, a zod `transform` fills it (`added_from`: id time, else `updated_at`), so `Item` has it required. Files and shares both go through `ItemSchema`. The date reaches the file on its next write.
- `added_at` stays out of `item_key`, so the share review never shows a date-only difference.
- Move to makes a new item in the other list (new id), so it gets a new date, matching where it lands in Oldest first. Items applied from a share keep the sender's date.
- Sort is a "Sort" submenu with a tick icon on the current option, the kit's existing pattern (desktop widget Style menu); the menu has no section headings.
- Months are written in English short form ("19 Sep"); en-GB writes "Sept".

## Next session topics
- None.
