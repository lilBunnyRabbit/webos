import { EditorView } from "@codemirror/view";

const removed = (percent: number) => `color-mix(in oklch, var(--error) ${percent}%, transparent)`;
const added = (percent: number) => `color-mix(in oklch, var(--success) ${percent}%, transparent)`;

// `@codemirror/merge` ships fixed light and dark colours as `&light`/`&dark` base-theme rules; the extra `.cm-editor`
// matches their specificity, so these state tokens win and every theme applies.
export const merge_theme = EditorView.theme({
  "&.cm-editor .cm-changedLine, &.cm-editor .cm-inlineChangedLine": { backgroundColor: added(10) },
  "&.cm-editor.cm-merge-a .cm-changedLine, &.cm-editor .cm-deletedChunk": { backgroundColor: removed(10) },
  "&.cm-editor.cm-merge-b .cm-changedText": { background: added(30) },
  "&.cm-editor.cm-merge-a .cm-changedText, &.cm-editor .cm-deletedChunk .cm-deletedText, &.cm-editor.cm-merge-b .cm-deletedText": {
    background: removed(30),
  },
  "&.cm-editor .cm-changeGutter": { width: "3px", paddingLeft: "0" },
  "&.cm-editor .cm-changedLineGutter, &.cm-editor.cm-merge-b .cm-changedLineGutter": { background: "var(--success)" },
  "&.cm-editor.cm-merge-a .cm-changedLineGutter, &.cm-editor .cm-deletedLineGutter": { background: "var(--error)" },
  "&.cm-editor .cm-collapsedLines": {
    padding: "0.25rem 1rem",
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    fontSize: "0.75rem",
    color: "color-mix(in oklch, var(--foreground) 65%, transparent)",
    background: "var(--background-light)",
    borderBlock: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)",
  },
  "&.cm-editor .cm-collapsedLines:hover": { color: "var(--foreground)" },
  "&.cm-editor .cm-collapsedLines:before, &.cm-editor .cm-collapsedLines:after": { content: "none" },
});
