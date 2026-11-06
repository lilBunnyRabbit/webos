# Easy Recipe Box
**Date:** 2026-11-06
**Participants:** owner, Claude

## Context
Steph: "I need something where I can add my recipes I like from websites and have them organized."

Owner: Recipe Box is probably too complex for normal users. Keep the system and the Cooklang syntax, and put an easier UI over it for building recipes, plus what Steph asked for.

What exists today (`src/lib/apps/user/recipe-box/`):
- Recipes are `.cook` files in `~/Documents/Recipes`. Subfolders are walked (`library.ts` `list_recipes`).
- The library has search plus tag filter chips (`library-view.svelte`).
- Views: Recipe, Table, Cook, Edit. Edit is a raw Cooklang source editor (`recipe-box.app.svelte`). New recipes start from `recipe_template()`, and the user has to hand-write `@flour{200%g}`. That is the part normal users bounce off.
- Front matter already parses arbitrary keys (`cooklang.ts` `parse_front_matter`).

Feasibility: WebOS has no backend, and recipe sites send no CORS headers, so a browser on GitHub Pages can't read a recipe page from its URL. With the HTML in hand, schema.org `Recipe` JSON-LD would give everything, but getting that HTML needs a proxy, a worker or a bookmarklet.

## Decisions

### Home: redesign Recipe Box (decided)
Same app, same `.cook` files. A form editor becomes the default Edit, and raw Cooklang moves behind a Form | Source switch.
- Rejected: a new simple app (two apps doing one job; cook and scale views duplicated).
- Rejected: a Simple/Advanced setting (two UIs to maintain, and users never find the switch).

### Import from websites: paste text only (decided)
No network. The user copies the recipe from the page (ingredients plus method) and pastes it. The app splits it into title, servings, ingredients and steps, then opens the result in the form for review before saving. It works offline and keeps "no backend" intact.
- Rejected: a public CORS proxy (a third party sees the URLs, can rate-limit or die, and would be the first external runtime service).
- Rejected: your own Cloudflare Worker (breaks "No backend").
- Rejected: a bookmarklet (painful on iPhone Safari).

### Editor: ingredient list + plain steps, auto-linked (decided)
The form has these fields:
- Title, servings, tags, source link.
- An ingredient list: amount, unit, name.
- Plain step text boxes.

On save, the first mention of each ingredient name in a step is written as `@name{qty%unit}`. Ingredients no step mentions go into a first step, "You'll need …". Opening an existing `.cook` file in the form rebuilds the lists from the parse. Name matching is lossy for hand-written files (plurals, synonyms), and Source stays exact.
- Rejected: inline ingredient chips in steps (fiddly contenteditable on touch, and imports still need the auto-link).
- Rejected: a form for metadata only (the @ syntax stays).

### Organize (decided)
- **Tag shelves:** the library groups recipes into rows by tag. Tags are picked in the form from the existing tags, or a new one is typed. They stay in the `tags:` front matter.
- **Source link:** a `source:` front matter key. The recipe view links back to the site.
- **Favourites:** a heart writes `favorite: true` to the file's front matter. The library gets a Favourites shelf first. It lives in the file, so there's no new state.
- Rejected: photos (owner: none for now), folders as collections.

### Shell (decided)
Nothing new. Import is a paste UI, favourites and tags live in the files, and `open` on a `.cook` already works.

### Credit (decided)
`meta.ts` `authors: [{ name: "Steph" }, OWNER]`.

## Key takeaways
- No file format change. `source` and `favorite` are ordinary Cooklang front matter keys.
- The paste parser and the auto-linker are the new algorithms. They get `docs/apps/recipe-box.md`.

## Action items
- [x] One app-builder: form editor, paste import, tag shelves, favourites, source link, docs page, changelog.

## Next session topics
- Photos (a local image beside the `.cook` file, Cooklang convention).
- URL import if a proxy or bookmarklet becomes acceptable.
- Smarter name matching (plurals) in the auto-linker.
