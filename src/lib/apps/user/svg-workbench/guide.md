## Getting an SVG in

Open a .svg file, drop one on the window, or paste SVG markup. It's optimised right away, and the status bar shows the size before and after.

## Optimising

- The options panel sets the number precision and what SVGO may change: merge paths, keep IDs, remove width and height or the title, pretty output. On a narrow window, pick **Options** from the view menu.
- **Save** writes a copy named *name.min.svg* next to the original. The replace button overwrites the original instead, after asking.
- An SVG you pasted or dropped asks where to save.

## Checking the result

- **Compare** shows the original and optimised side by side. **Difference** marks every pixel that changed in red.
- Switch the backdrop between checker, light and dark to spot edges.
- Zoom with Ctrl+scroll, a pinch or a double-click; drag or scroll to pan. Both panes move together.
- **Markup** shows the optimised source with the removed lines marked.

## PNGs and components

- **PNG** saves one PNG per ticked size (the longest side), next to the SVG. Add any other size up to 8192.
- **Component** turns the SVG into a Svelte component with size and colour props. Copy it or save it as a .svelte file.

The Terminal has the same tools: `svg optimize`, `svg png` and `svg component`.
