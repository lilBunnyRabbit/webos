## Getting started

- Type `help` to list every command, or `help ls` to explain one.
- `ls`, `cd`, `cp`, `mv` and friends work on your files. Apps add their own commands too.
- The same commands run from the command palette: Ctrl+K, then start with `>`.

## Pipes

Join commands with `|`. Results are values with fields, not plain text, so you can filter and sort them:

- `ls | where size > 1mb | sort size -r`
- `where name =~ cat` keeps names that contain "cat". `where modified < 2d` keeps what changed more than two days ago.
- `first 5`, `last 5`, `count` and `select name size` trim the result.

## Keys

- **Tab** completes, and shows a list when there's more than one match. Tab or the arrows move through it, Enter picks.
- Gray text after the cursor is a suggestion from your history: **→** accepts it.
- **↑** and **↓** walk through earlier commands.
- **Ctrl+C** stops a running command or clears the line. **Ctrl+L** clears the screen. **Ctrl+U** deletes up to the cursor.
- On a touchscreen, the key row under the prompt has Tab, Esc, the arrows, `|`, `~`, `/` and a Ctrl key that applies to the next key you type.

Each window keeps its own folder and its last 100 results. History is shared by every Terminal window.
