import type { Span } from "./ast";
import { error_at, type Diagnostic } from "./diagnostics";

export const TokenType = {
  NUMBER: "number",
  STRING: "string",
  IDENT: "ident",
  KEYWORD: "keyword",
  PUNCT: "punct",
  PREV: "prev",
  EOF: "eof",
} as const;
export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface Token {
  type: TokenType;
  value: string;
  span: Span;
}

export const DECLARATION_KEYWORDS = ["const", "fn", "var", "output"] as const;
export const KEYWORDS = new Set<string>([...DECLARATION_KEYWORDS, "true", "false"]);

const PUNCT_2 = ["<=", ">=", "==", "!="];
const PUNCT_1 = new Set(["+", "-", "*", "/", "%", "<", ">", "&", "|", "!", "?", ":", "(", ")", ",", "="]);

export const is_digit = (char: string | undefined) => char !== undefined && char >= "0" && char <= "9";
export const is_ident_start = (char: string | undefined) => char !== undefined && /[A-Za-z_]/.test(char);
export const is_ident_part = (char: string | undefined) => char !== undefined && /[A-Za-z0-9_]/.test(char);

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function tokenize(source: string): LexResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let index = 0;
  const push = (type: TokenType, value: string, from: number) => tokens.push({ type, value, span: { from, to: index } });

  while (index < source.length) {
    const char = source[index];
    const from = index;

    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      index++;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index++;
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        index = source.length;
        diagnostics.push(error_at("Unterminated block comment", { from, to: from + 2 }));
      } else index = end + 2;
      continue;
    }

    if (char === '"') {
      index++;
      while (index < source.length && source[index] !== '"' && source[index] !== "\n") index++;
      if (source[index] !== '"') {
        diagnostics.push(error_at("Unterminated string", { from, to: index }));
        push(TokenType.STRING, source.slice(from + 1, index), from);
        continue;
      }
      index++;
      push(TokenType.STRING, source.slice(from + 1, index - 1), from);
      continue;
    }

    if (char === "@") {
      index++;
      while (is_ident_part(source[index])) index++;
      const name = source.slice(from + 1, index);
      if (name !== "prev") diagnostics.push(error_at(`Unknown directive "@${name}". Did you mean "@prev"?`, { from, to: index }));
      else push(TokenType.PREV, "@prev", from);
      continue;
    }

    if (is_digit(char) || (char === "." && is_digit(source[index + 1]))) {
      while (is_digit(source[index])) index++;
      if (source[index] === ".") {
        index++;
        while (is_digit(source[index])) index++;
      }
      if (source[index] === "e" || source[index] === "E") {
        const mark = index;
        index++;
        if (source[index] === "+" || source[index] === "-") index++;
        if (!is_digit(source[index])) {
          index = mark + 1;
          diagnostics.push(error_at("Malformed number: the exponent needs digits", { from, to: index }));
        }
        while (is_digit(source[index])) index++;
      }
      push(TokenType.NUMBER, source.slice(from, index), from);
      continue;
    }

    if (is_ident_start(char)) {
      while (is_ident_part(source[index])) index++;
      const name = source.slice(from, index);
      push(KEYWORDS.has(name) ? TokenType.KEYWORD : TokenType.IDENT, name, from);
      continue;
    }

    const two = source.slice(index, index + 2);
    if (PUNCT_2.includes(two)) {
      index += 2;
      push(TokenType.PUNCT, two, from);
      continue;
    }
    if (PUNCT_1.has(char)) {
      index++;
      push(TokenType.PUNCT, char, from);
      continue;
    }

    index++;
    diagnostics.push(error_at(`Unexpected character "${char}"`, { from, to: index }));
  }

  tokens.push({ type: TokenType.EOF, value: "", span: { from: index, to: index } });
  return { tokens, diagnostics };
}
