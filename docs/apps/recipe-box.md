# Recipe Box
Id `recipe-box` · Source: `src/lib/apps/user/recipe-box/` · [scheduler](../system/services/scheduler.md#apps-on-it) (cook timers) · [brainstorm](../brainstorm/2026-11-06_easy-recipe-box.md)

## What it does

Recipes as [Cooklang](https://cooklang.org) `.cook` files in `~/Documents/Recipes` (subfolders walked). The library puts them on shelves by tag with Favourites first; a recipe reads as a page, a table or one step at a time with timers, scales servings and converts units. Most people never see Cooklang: they paste a recipe copied from a website or fill in a form, and the app writes the file. Source is the raw file, for people who want it.

## How it works

Pure logic is Node-tested beside it: `cooklang.ts` (parser), `amounts.ts` (scaling, units), `recipe-form.ts` (the form and its writer), `paste.ts` (the paste parser), `library.ts` (summaries, shelves). Rendering is `recipe-box.app.svelte` with `library-view`, `recipe-view`, `recipe-form`, `paste-dialog`, `table-view` and `cook-mode`.

### One source of truth: the file text

The window holds the file's text (`text`) and what's on disk (`saved_text`); dirty is `text !== saved_text`. Form and Source are two editors over `text`:

- Entering Form (switching to Edit, switching Source → Form, or a recipe finishing loading while Edit is up) rebuilds the form from `text` with `form_from_cook` (`recipe-form.ts:201`).
- Every input in the form (one `oninput` on the `<form>`, plus the add, remove and move buttons) writes `text = form_to_cook(form)` (`recipe-form.ts:166`), so the preview, Save, dirty and Recipe, Table and Cook all read the same thing.
- Source edits `text` directly and is exact.

A new recipe (New, or a paste) is a draft with no path: Save creates `{title}.cook` in the recipes folder with a free name (`create_file` without overwrite), then saves in place like any file. Save on an untouched draft does nothing, and a second Save while one runs waits for it instead of creating a second file.

### Writing Cooklang from the form

`RecipeForm` is title, servings, tags, source, ingredient rows (`amount`, `unit`, `name`, a hidden `fixed`), step texts and `extra`: the front matter keys the form has no field for (`favorite`, `time`, `description`…), written back unchanged.

- **Front matter:** `title`, `servings`, `tags: [a, b]`, `source`, then `extra`. Empty fields are left out; a list with a comma in an item is written as `- item` lines. `serves` reads into Servings and is written back as `servings`.
- **Ingredient names:** `butter, softened` is the name `butter` with the Cooklang note `(softened)`; `parsley (optional)` is `@?parsley{}`. So notes and optional ingredients round-trip without extra fields.
- **Amounts:** `{qty%unit}`, `{qty}` or `{}`; `=` kept for a hand-written fixed amount; unicode fractions written as `1 1/2` so they scale (`normalize_quantity`, `recipe-form.ts:49`).
- **Steps:** one paragraph each; a line break inside a step is Cooklang's trailing `\`.

### The auto-link rule

`link_steps` (`recipe-form.ts:110`):

1. Rows are grouped by lower-cased name. Groups go longest name first, so `peanut butter` is claimed before `butter` can match inside it.
2. Within a group, the n-th row links the n-th whole-word, case-insensitive mention of the name in step order. One row per mention is how a recipe with salt in step 1 and again in step 4 keeps both amounts.
3. The marker keeps the step's spelling (`Flour` at the start of a sentence stays `@Flour{200%g}`), so the step reads as written. The ingredient list shows the first spelling.
4. Cooklang already in a step (`#pot{}`, `~{10%minutes}`, a marker someone typed) is never linked into.
5. Rows no step mentions go into a first step, `You'll need @a{…}, @b{…} and @c{…}.` On the way back, `form_from_cook` recognises that exact shape and drops the step (its ingredients stay rows), so it's rebuilt, not duplicated.

No plural or synonym matching: `ripe bananas` in the list and `bananas` in a step don't link, and that row lands in You'll need.

### Reading a file back into the form

`form_from_cook` collects one ingredient row per marker in step order and turns each step into plain text: ingredients become their name, cookware and timers stay as their Cooklang (`#pot{}`, `~{10%minutes}`) so they re-serialize as they were. Row order is rebuilt from the steps, so moving rows only changes the You'll need order until the form is left.

What the form can't keep is reported, never silently dropped: `form_issues` (`recipe-form.ts:254`) lists

| Issue | Saving from the form |
|-------|----------------------|
| `sections` | `== Name ==` headings go, their steps become plain steps |
| `notes` | `>` notes are dropped |
| `comments` | `--` and `[- -]` comments are dropped |
| `references` | `@./other/recipe{}` becomes a plain ingredient |
| `header` | front matter lines the parser skips (`#` comments, nested or block YAML like `description: >`) are dropped |
| `moved` | an amount moves to the first mention of the ingredient (checked by writing the form back and comparing the parsed steps) |

Form shows a warning naming them with Edit the source; Source is unchanged.

### The paste parser

`parse_pasted` (`paste.ts:118`), no network:

1. Lines are trimmed, blank ones dropped, non-breaking spaces made plain. The first line is the title unless it's a heading.
2. Headings switch the section: `Ingredients…` → ingredients; `Method`, `Instructions`, `Directions`, `Steps`, `Preparation`, `How to make` → steps; `Notes`, `Tips`, `Nutrition`, `Equipment`, `Storage`, `Video`, `FAQ` → ignored. Case-insensitive, `#` and a trailing colon allowed, 40 characters at most.
3. A short line with `Serves 4`, `Servings: 8`, `Yield 2-3`, `Makes 12` or `4 servings` sets servings and is skipped.
4. With headings, text before the first one (the blog intro, prep times) is dropped. Without any, amount-led lines (a digit or a unicode fraction, 80 characters at most, not `1.`-numbered) are ingredients and the rest are steps; prose alone becomes all steps.
5. In the ingredients section, subheadings like `For the topping:` are skipped. In steps, `1.`, `2)`, `Step 3:` and bullets are stripped.

`parse_ingredient_line` (`paste.ts:72`) strips the bullet (`-`, `•`, `▢`, `☐`…), reads a quantity (`2`, `1.5`, `2,5`, `1/2`, `1 1/2`, `½`, `1½`, `2-3`, `2 to 3`) or a word (`a`, `an`, `one`… `half`, only before a unit), then a unit: anything `amounts.ts` converts (`g`, `cups`, `tbsp.`, `fl oz`…) or a kitchen word (`pinch`, `clove`, `can`, `handful`, `slice`, `stick`, `bunch`, `sprig`…), then an optional `of`. A leading `(60ml)` after the unit moves behind a comma as a note. `2 large eggs` keeps `large eggs` as the name.

The result opens in the form as an unsaved draft (`pasted_form`); nothing is written until Save.

### Favourites and the source link

The heart writes `favorite: true` or removes it (and any `favourite:`) through `set_meta` (`recipe-form.ts:275`), which touches that one front matter line and nothing else, so it never rewrites a hand-made file. On the open recipe it reads the file from disk (another window may have saved it), writes the change, and applies it to the editor text separately, so unsaved edits stay unsaved and stay. A card's heart reads, edits and writes that file. `source:` starting with `http(s)://` shows as "From {host}" and opens in a new tab.

### Shelves

`shelves` (`library.ts`): Favourites, one per tag (alphabetical), then Untagged; a recipe is on every shelf of its tags. Search filters before grouping. The library re-reads on the revision of the recipes folder and of every subfolder holding a recipe. A shelf is a horizontal snap row; one shelf only (no tags, no favourites) is shown as the plain grid. A tag chip shows that tag as a grid.

## Data

| What | Where |
|------|-------|
| Recipes | `.cook` files in the chosen folder (`~/Documents/Recipes` by default), standard Cooklang; `source` and `favorite` are ordinary front matter keys |
| Settings | `/var/lib/apps/recipe-box/storage.json`: folder, unit system |
| Cook timers | scheduler jobs (`timers.ts`) |

Props: `path` (a `.cook` file).

## Dependencies & licences

None of its own. Unit conversion comes from Unit Converter's `convert.ts`.

## Limits

- Name matching is literal (see the auto-link rule).
- A step that starts with `>` or `=`, or holds `--`, `@word`, `#word` or `~{…}`, means Cooklang to the parser; the form doesn't escape them.
- The paste parser is tuned on blog-style, numbered and headless pastes; a page that interleaves ingredient groups and steps, or puts amounts after the name (`flour, 200 g`), needs fixing in the form.
- Section-by-section ingredient groups in a paste are flattened into one list.

## Decisions

- [Easy Recipe Box brainstorm](../brainstorm/2026-11-06_easy-recipe-box.md): form over Cooklang in the same app, paste-only import (no proxy), auto-linked plain steps, shelves, favourites and source in the front matter.
