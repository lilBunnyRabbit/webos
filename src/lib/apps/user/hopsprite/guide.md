## Getting started

A blank 32×32 sprite is ready when you open the app. The **File** menu sits at the top left; on a phone it's the button with the file name. **File › New sprite…** picks another size (up to 1024×1024) and a starting palette. **File › Open…** opens a `.hopsprite` file, or imports a PNG or GIF; an animated GIF comes in frame by frame. You can also open a PNG or GIF from the file manager with Hopsprite.

## Drawing

- The left button draws with the current colour, the right button with the second colour. Press X to swap them.
- On a phone, long-press the canvas to pick up the colour under your finger.
- Each tool has a key: Pencil B, Eraser E, Fill G, Eyedropper I, Line L, Rectangle U, Ellipse O, Select M, Magic wand W, Move V, Pan H.
- The bar at the top shows the current tool's options: brush size and shape (Shift+, and Shift+. change the size), pixel-perfect lines, dither patterns, filled or outlined shapes, and mirror drawing.
- Hold Shift while drawing a line to snap its angle, or a rectangle or ellipse to make it square or round.

## Colours

The palette holds up to 256 colours, and every pixel points at one of them. Changing a palette colour recolours everything drawn with it. Click or tap the current colour to edit it, load a preset palette or remove a colour. The first swatch is transparent and paints holes. Right-click a swatch to make it the second colour.

## Selecting and moving

- Select drags a rectangle; Magic wand picks pixels of one colour, touching or anywhere. Shift adds to the selection, Alt takes away.
- Ctrl+A selects all, Ctrl+D deselects, Ctrl+Shift+I inverts.
- Copy, cut and paste with Ctrl+C, Ctrl+X and Ctrl+V. Delete or Backspace clears the selected pixels.
- Drag the selection with the Move tool, or nudge it with the arrow keys. Enter places it, Escape puts it back. Shift+H and Shift+V flip it, or the whole layer when nothing is selected.

## Frames and animation

- The strip at the bottom lists the frames. **+** adds a copy of the current frame (Alt+D); Alt+N adds an empty one.
- Comma and period step between frames, and so do the left and right arrows when nothing is selected. Enter plays and pauses.
- Right-click a frame for duration, tags, moving and deleting. Double-click it to set its duration. Shift-click a second frame to pick a range.
- **Timing, tags and onion skin** sets the frame duration, loop, ping-pong or once, the tag to play, and how many onion-skin frames to show before and after.

## Layers

Layers sit in the side panel, or behind the layers button next to the strip on a narrow window. Hide, lock, rename (double-click) and merge down from there. You can't draw on a hidden or locked layer.

## Viewing

Scroll to pan and Ctrl+scroll to zoom. Hold Space and drag, drag with the middle button, or use the Pan tool to move around. On a phone, pinch with two fingers. Ctrl+0 fits the sprite to the window. **File › Tile grid** draws a grid every 8, 16 or 32 px.

## Saving and exporting

- **Save** (Ctrl+S) writes a `.hopsprite` file that keeps layers, frames, tags and the palette. An imported PNG or GIF asks where to save the sprite.
- **Export** writes this frame or the whole animation as SVG or GIF, scaled up, with a tag and direction to pick for animations.
- **File › Sprite size…** changes the canvas or scales the art. **File › Flip and rotate** turns the whole sprite.
