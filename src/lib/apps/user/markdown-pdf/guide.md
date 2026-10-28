## Writing

- Open a `.md` file, start a **Blank** one, or try the **Sample** to see what the layout does. In Files, a Markdown file also opens here from **Open with**.
- Write in the editor and watch the pages beside it, or below it in a narrow window. **Edit**, **Split** and **Pages** switch between the editor, both, or the pages alone.
- The first top-level heading (`# Title`) is the title the header shows; without one, the file name is.
- **Save** writes the Markdown file back (Ctrl+S, Ctrl+Shift+S for Save as). A new document asks where to save it.

## Exporting

**Export PDF** (Ctrl+P) opens the print dialog. Pick **Save as PDF** as the printer to get the file.

## Page settings

The sliders button opens the page settings, kept for every document:

- **Template:** *Clean*, *Report* (numbered sections, justified text, each top-level heading on a new page) or *Notes* (compact).
- Page size (A4 or Letter), orientation and margins.
- Font, text size and line height.
- A table of contents, the title and date in the header, and page numbers.

## From Terminal

`md2pdf notes.md` lays out a file and goes straight to the print dialog. Add `--template report`, `--size letter`, `--landscape` or `--toc`.
