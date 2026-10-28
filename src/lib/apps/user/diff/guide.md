## Comparing

- **Open files…** picks two text files at once. **Paste text** puts the cursor on the original side: paste there, and in Split the changed side takes the next paste by itself.
- Each side's header has its own buttons to open a file or paste the clipboard into just that side.
- From File Explorer, **Open with** › Diff puts a text file on the original side. In the Terminal, `diff a.txt b.txt` opens both, and `diff a.txt b.txt --stat` just counts the changes.

## Reading the changes

- **Split** shows the sides next to each other, **Unified** shows one text with the changes inline. A narrow window starts in Unified.
- Jump between changes with the arrow buttons, or F7 and Shift+F7.
- The toolbar toggles collapsing unchanged lines, ignoring whitespace and wrapping long lines. Click or tap a collapsed block to open it.
- **Swap sides** exchanges original and changed.

## Editing

The sides are editors, and the diff updates as you type (in Unified, only the changed side). A side opened from a file saves back to it with its save button or Ctrl+S (Cmd+S on a Mac). If the file changed on disk meanwhile, you're asked before it's overwritten. System files show a lock and can't be edited.
