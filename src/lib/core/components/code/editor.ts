import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * CodeMirror styled with the theme's CSS variables, so derived themes apply without rebuilding the editor.
 * Only the raw theme variables (`--primary`, …) exist at runtime; `@theme inline` doesn't emit the font and text sizes.
 */
export const token_theme = EditorView.theme({
  "&": { height: "100%", color: "var(--foreground)", backgroundColor: "var(--background)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: '"Hack", ui-monospace, monospace', fontSize: "0.8125rem", lineHeight: "1.5rem" },
  ".cm-content": { caretColor: "var(--primary)", padding: "0.25rem 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 28%, transparent)",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--foreground) 4%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    color: "color-mix(in oklch, var(--foreground) 65%, transparent)",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 1rem 0 1rem", fontVariantNumeric: "tabular-nums" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-foldGutter .cm-gutterElement": { paddingRight: "0.25rem" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklch, var(--primary) 18%, transparent)",
    outline: "1px solid color-mix(in oklch, var(--primary) 50%, transparent)",
  },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklch, var(--warning) 28%, transparent)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "color-mix(in oklch, var(--primary) 40%, transparent)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in oklch, var(--foreground) 10%, transparent)" },
  ".cm-panels": { backgroundColor: "var(--background-light)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid color-mix(in oklch, var(--foreground) 8%, transparent)" },
  ".cm-panel.cm-search": { fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif', fontSize: "0.8125rem", padding: "0.5rem" },
  ".cm-textfield": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid color-mix(in oklch, var(--foreground) 16%, transparent)",
    borderRadius: "0.375rem",
    padding: "0.125rem 0.375rem",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--background-lighter)",
    color: "var(--foreground)",
    border: "none",
    borderRadius: "0.375rem",
    padding: "0.125rem 0.5rem",
  },
  ".cm-panel button[name=close]": { color: "var(--foreground)" },
  ".cm-tooltip": {
    backgroundColor: "var(--background-lighter)",
    color: "var(--foreground)",
    border: "none",
    borderRadius: "0.5rem",
    boxShadow: "0 0.5rem 1.5rem -0.25rem color-mix(in oklch, var(--background-darkest) 55%, transparent)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "color-mix(in oklch, var(--primary) 20%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-foldPlaceholder": { backgroundColor: "var(--background-lighter)", color: "var(--foreground)", border: "none" },
  ".cm-tooltip.cm-completionInfo, .cm-tooltip-hover": { padding: "0.5rem 0.625rem", maxWidth: "22rem" },
  ".cm-completionDetail": { fontFamily: '"Hack", ui-monospace, monospace', fontStyle: "normal", color: "color-mix(in oklch, var(--foreground) 65%, transparent)" },
  ".cm-symbol-doc": { fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif', fontSize: "0.8125rem", lineHeight: "1.25rem" },
  ".cm-symbol-doc p": { margin: "0" },
  ".cm-symbol-signature": { display: "block", marginBottom: "0.25rem", fontFamily: '"Hack", ui-monospace, monospace', color: "var(--primary)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--error)", textUnderlineOffset: "0.2em" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--warning)", textUnderlineOffset: "0.2em" },
  ".cm-lintRange-info": { backgroundImage: "none", textDecoration: "underline dotted var(--info)", textUnderlineOffset: "0.2em" },
  ".cm-tooltip-lint": { padding: "0.25rem" },
  ".cm-diagnostic": { fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif', fontSize: "0.8125rem", padding: "0.25rem 0.5rem", borderLeftWidth: "3px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--error)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
  ".cm-diagnostic-info": { borderLeftColor: "var(--info)" },
  ".cm-gutter-lint": { width: "1rem" },
  ".cm-gutter-lint .cm-gutterElement": { padding: "0 0 0 0.25rem", display: "flex", alignItems: "center" },
  ".cm-lint-marker": { content: "none", width: "0.5rem", height: "0.5rem", borderRadius: "9999px" },
  ".cm-lint-marker-error": { backgroundColor: "var(--error)" },
  ".cm-lint-marker-warning": { backgroundColor: "var(--warning)" },
  ".cm-lint-marker-info": { backgroundColor: "var(--info)" },
});

// Code is content, not chrome (like Paint's swatches): syntax uses the brand roles; state colours stay for state.
export const token_highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.tagName], color: "var(--primary)" },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--secondary)" },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: "var(--accent)" },
    { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--tertiary)" },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.function(tags.definition(tags.variableName))], color: "var(--foreground)", fontWeight: "600" },
    { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.meta, tags.processingInstruction], color: "color-mix(in oklch, var(--foreground) 55%, transparent)", fontStyle: "italic" },
    { tag: [tags.attributeName, tags.propertyName], color: "color-mix(in oklch, var(--foreground) 80%, transparent)" },
    { tag: tags.invalid, color: "var(--error)" },
    { tag: tags.heading, color: "var(--primary)", fontWeight: "600" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "600" },
    { tag: tags.link, color: "var(--primary)", textDecoration: "underline" },
  ])
);
