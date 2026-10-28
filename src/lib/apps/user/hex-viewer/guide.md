## Opening a file

- **Open a file…** picks one from WebOS, **From device…** from your computer or phone. You can also drop or paste a file into the window, or use Open with › Hex Viewer on any file.
- Each row shows 16 bytes: the offset on the left, the hex in the middle, the same bytes as text on the right. Dots stand for bytes that aren't printable text.

## Moving and selecting

- Click or tap a byte to put the cursor on it. Drag, or Shift+click, to select a range.
- Arrows move byte by byte, Page Up and Page Down by a screen, Home and End to the row's ends, Ctrl+Home and Ctrl+End to the file's ends. Hold Shift to select as you move.
- Type an offset in the **Go to** box and press Enter: hex like `0x1f` or decimal like `31`. Ctrl+G jumps to the box.
- Ctrl+A selects the whole file.

## Copying and inspecting

- Ctrl+C copies the selection as hex, Ctrl+Shift+C as text. The toolbar buttons do the same. Up to 4 MB at a time.
- The **byte inspector** under the bytes reads the values starting at the cursor as integers and floats. Switch **LE** and **BE** for byte order, or hide it with its toolbar button.
- The status bar shows the file size, the cursor's offset in hex and decimal, and the selection size.

On a Mac, use Cmd in place of Ctrl.
