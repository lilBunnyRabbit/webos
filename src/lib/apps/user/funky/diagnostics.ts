import type { Span } from "./ast";

export const Severity = { ERROR: "error", WARNING: "warning", INFO: "info" } as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export interface Diagnostic {
  severity: Severity;
  message: string;
  span?: Span;
}

export const error_at = (message: string, span?: Span): Diagnostic => ({ severity: Severity.ERROR, message, span });
export const warn_at = (message: string, span?: Span): Diagnostic => ({ severity: Severity.WARNING, message, span });
export const info_at = (message: string, span?: Span): Diagnostic => ({ severity: Severity.INFO, message, span });

export const has_errors = (diagnostics: readonly Diagnostic[]) => diagnostics.some((diagnostic) => diagnostic.severity === Severity.ERROR);

export interface LineCol {
  line: number;
  col: number;
}

export function line_col(source: string, offset: number): LineCol {
  let line = 1;
  let start = 0;
  for (let index = 0; index < offset && index < source.length; index++) {
    if (source[index] === "\n") {
      line++;
      start = index + 1;
    }
  }
  return { line, col: offset - start + 1 };
}
