## Cards

- **Add card** in the toolbar adds to the first column that isn't done; each column has its own **Add card** at the bottom.
- Click or tap a card to open it: title, column, labels, a due day, a checklist and notes. It saves as you type.
- Right-click a card, or press and hold it on a phone, for Move to, Move up or down, Archive and Delete.
- Right-click a label, or hold it, to rename, recolour or delete it.

## Moving

- **Drag** a card to another column or place. On a phone, press and hold it first, then drag; a plain swipe scrolls the columns.
- **Keyboard:** focus a card and hold Alt with the arrows. Left and right change its column, up and down its place.
- Drag a column by its header to reorder the columns.

## Columns

The ⋯ on a column renames it, sets a limit of cards (the count warns at the limit and turns red over it), marks it as a done column, moves it or deletes it. Cards in a done column count as finished, and **Archive done** clears them away. **Archive** in the toolbar lists archived cards to restore or delete for good.

## Boards

Switch boards from the list at the top left. The ⋯ next to it makes a new board, renames it, adds a column, archives done cards or deletes the board.

**New board from a folder** turns a folder of markdown files into a board. Each file is a card, and its `status` field picks the column. Moving a card rewrites only that field, and opening one opens the file in Text Editor. **Folder settings** changes the field, the column order, the fields shown on cards and a template for new files.

## Saved where

Boards save to `/var/lib/apps/kanban/boards.json`. Folder boards keep their cards in the folder's own files. The app icon shows how many open cards are due.
