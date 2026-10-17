import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { EditorView, hoverTooltip } from "@codemirror/view";

export const SymbolKind = { KEYWORD: "keyword", VARIABLE: "variable", FUNCTION: "function", CONSTANT: "constant" } as const;
export type SymbolKind = (typeof SymbolKind)[keyof typeof SymbolKind];

/** One documented name of a language: what completion lists and hover explains. */
export interface SymbolDoc {
  name: string;
  kind: SymbolKind;
  /** The call shape for functions, or the range or type for values. Shown in mono. */
  signature?: string;
  detail: string;
}

export interface CodeDiagnostic {
  from: number;
  to: number;
  severity: "error" | "warning" | "info";
  message: string;
}

function symbol_doc(symbol: SymbolDoc): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-symbol-doc";
  if (symbol.signature) {
    const signature = document.createElement("code");
    signature.className = "cm-symbol-signature";
    signature.textContent = symbol.signature;
    root.append(signature);
  }
  const detail = document.createElement("p");
  detail.textContent = symbol.detail;
  root.append(detail);
  return root;
}

/**
 * Completion and hover docs from a list of symbols. `symbols` is read on every request, so it can include names the
 * user declared. `word` matches one name.
 */
export function symbol_assist(symbols: () => readonly SymbolDoc[], word = /[\w@]+/): Extension {
  const find = (name: string) => symbols().find((symbol) => symbol.name === name);
  const pattern = new RegExp(`(?:${word.source})$`);

  const complete = (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(pattern);
    if (!before && !context.explicit) return null;
    const options: Completion[] = symbols().map((symbol) => ({
      label: symbol.name,
      type: symbol.kind,
      detail: symbol.signature?.replace(symbol.name, "").replace(/^ · /, "").trim(),
      info: () => symbol_doc(symbol),
    }));
    return { from: before?.from ?? context.pos, options, validFor: pattern };
  };

  const hover = hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const offset = pos - line.from;
    const global = new RegExp(word.source, "g");
    for (const match of line.text.matchAll(global)) {
      const start = match.index ?? 0;
      if (offset < start || offset > start + match[0].length) continue;
      const symbol = find(match[0]);
      if (!symbol) return null;
      return { pos: line.from + start, end: line.from + start + match[0].length, above: true, create: () => ({ dom: symbol_doc(symbol) }) };
    }
    return null;
  });

  return [autocompletion({ override: [complete], icons: false }), hover];
}

/** A gutter of markers for diagnostics the app computes itself; push them with `show_diagnostics`. */
export const diagnostics_gutter: Extension = lintGutter();

export function show_diagnostics(view: EditorView, diagnostics: readonly CodeDiagnostic[]): void {
  const length = view.state.doc.length;
  const clamped: Diagnostic[] = diagnostics.map((diagnostic) => {
    const from = Math.min(diagnostic.from, length);
    return { ...diagnostic, from, to: Math.min(Math.max(diagnostic.to, from), length) };
  });
  view.dispatch(setDiagnostics(view.state, clamped));
}

export function reveal(view: EditorView, from: number, to = from): void {
  view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
  view.focus();
}
