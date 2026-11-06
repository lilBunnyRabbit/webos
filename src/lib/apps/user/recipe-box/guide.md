## Adding a recipe

- **Paste** takes a recipe you copied from a website. Copy everything from the title to the last step, paste it, and Recipe Box splits it into the title, servings, ingredients and steps. Check the form and press Save; nothing is kept until you do.
- **New** opens an empty form: a title, servings, tags, a link to where the recipe came from, the ingredients (amount, unit, name) and the steps.
- In the steps, just write the ingredient's name ("Mix the flour with the eggs"). On save, its amount is shown there. Ingredients no step mentions are listed in a first "You'll need" step.
- Write a note after a comma, like "butter, softened". The arrows move ingredients and steps up and down.
- The device button imports `.cook` files you already have.

## Keeping them organized

- The library puts recipes on shelves, one per tag, with **Favourites** first. Search looks through all of them; tap a tag to see only that one.
- The heart on a recipe or a card adds it to Favourites. A recipe with a link shows "From" and the site's name.
- Recipes are `.cook` files in `/home/Documents/Recipes`. The folder button on the toolbar picks another folder.

## Source

- **Edit** has **Form** and **Source**. Source is the recipe as a [Cooklang](https://cooklang.org) file: `@flour{200%g}` for an ingredient, `#pot{}` for cookware, `~{10%minutes}` for a timer, `>` for a note, `==` for a section.
- The form can't show notes, sections or comments. When a recipe has them, it says what saving from the form would change; edit those recipes in Source.
- On a wide window, the editor and a preview sit side by side. Save with Ctrl+S.

## Reading and cooking

- **Recipe**, **Table** and **Cook** are the views. The minus and plus buttons change the servings, and **As written**, **Metric** or **Imperial** convert the amounts.
- **Cook** shows one step at a time. Use **Back** and **Next**, or the Left and Right arrow keys.
- Tap a timer in a step to start it. Timers keep running after you close the window and notify you when they're done.
