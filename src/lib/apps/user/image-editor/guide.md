## Opening an image

Click or tap **Open an image…** (Ctrl+O), drop an image onto the window, or paste one. You can also open an image from the file manager with Image Editor.

## Editing

Pick a tool in the side panel (below the image on a narrow window):

- **Crop:** drag the frame or its handles, choose a ratio if you want one, then press **Crop**.
- **Resize:** type a width or height in pixels or percent. With **Keep aspect ratio** on, the other side follows. Press **Resize** to apply.
- **Rotate:** turn left or right by 90°, flip horizontally or vertically, or drag **Angle** for any angle and press **Rotate**.
- **Adjust:** brightness, contrast, saturation, hue, blur, grayscale and sepia. **Reset all** puts them back.

Nothing touches the original until you save. Undo with Ctrl+Z, redo with Ctrl+Shift+Z or Ctrl+Y.

## Zoom

Use the zoom buttons in the corner. Click or tap the percentage for actual size, or **Fit to window** to see it whole. Ctrl+scroll or pinch zooms, and dragging the image pans.

## Saving

- **Save** (Ctrl+S) overwrites the file you opened. A pasted or dropped image, or a system file, asks where to save instead.
- **Save as…** (Ctrl+Shift+S) picks PNG, JPEG or WebP, with a quality slider for JPEG and WebP, then a location.

## From the Terminal

- `image edit photo.jpg` opens a file here.
- `image convert photo.png -f webp`, `image resize photo.jpg 800` and `image rotate photo.jpg 90` save an edited copy next to the original without opening the editor.
