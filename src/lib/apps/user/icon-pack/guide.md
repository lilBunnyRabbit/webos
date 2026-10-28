## Making a pack

- Open an SVG or an image with the folder button, or drop or paste one onto the window. You can also open one from the file manager with Icon Pack.
- Tune the icon and the social card in the side panel. On a narrow window, switch between **Icon** and **Card** above the settings.
- Press **Save pack…** and pick where the zip goes. It's named after your file, like `logo-icons.zip`.

## Picking a source

An SVG works best. A picture should be at least 512 × 512 px, or the large icons look soft. A yellow note above the preview warns about that, and about SVGs that link to other files, use fonts that may not be installed, or render blank.

## Icon settings

- **Background** fills the icon. **Transparent** keeps favicons and app icons see-through; the Apple and maskable icons always keep the colour.
- **Padding** adds space around the icon on every side.
- **Maskable** is the padding of the Android icon that gets cropped to a shape. About 20% keeps a square logo inside the safe zone.
- **Corners** and **Show safe zone** change only the preview.

## Social card

Set a title (your file name by default), a subtitle, a background (the theme's by default) and a Sans or Mono font.

Your settings are remembered for next time.

## From the Terminal

`icons logo.svg` saves the zip next to the file. Add `--bg #1a1a1a` for a background colour, `--padding 10%` for space around the icon, and `--to` for another folder.
