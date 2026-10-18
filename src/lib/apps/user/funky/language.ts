import { HighlightStyle, StreamLanguage, syntaxHighlighting, type StringStream } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { SymbolKind, type SymbolDoc } from "$kit/components/code";
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS, BUILTIN_VARIABLES, FUNCTIONS_BY_NAME, VARIABLES_BY_NAME } from "./builtins";
import type { Scope } from "./resolve";
import { format_dsl } from "./emit";
import { STDLIB } from "./stdlib";

interface State {
  in_comment: boolean;
  after_keyword: boolean;
}

const DECLARATIONS = new Set(["const", "fn", "var", "output"]);

function token(stream: StringStream, state: State): string | null {
  if (state.in_comment) {
    if (stream.skipTo("*/")) {
      stream.next();
      stream.next();
      state.in_comment = false;
    } else stream.skipToEnd();
    return "comment";
  }
  if (stream.eatSpace()) return null;
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match("/*")) {
    state.in_comment = true;
    return token(stream, state) ?? "comment";
  }
  if (stream.match(/^"[^"\n]*"?/)) return "string";
  if (stream.match(/^@\w*/)) return "keyword";
  if (stream.match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i)) return "number";
  const word = stream.match(/^[A-Za-z_]\w*/) as RegExpMatchArray | null;
  if (word) {
    const name = word[0];
    const declared = state.after_keyword;
    state.after_keyword = DECLARATIONS.has(name);
    if (name === "true" || name === "false") return "bool";
    if (DECLARATIONS.has(name)) return "keyword";
    if (declared) return "definition";
    if (FUNCTIONS_BY_NAME.has(name)) return "builtinFunction";
    if (VARIABLES_BY_NAME.has(name) || name in BUILTIN_CONSTANTS) return "builtin";
    return stream.match(/^\s*\(/, false) ? "call" : "variableName";
  }
  stream.next();
  state.after_keyword = false;
  return "operator";
}

const funky = StreamLanguage.define<State>({
  name: "funky",
  startState: () => ({ in_comment: false, after_keyword: false }),
  token,
  languageData: { commentTokens: { line: "//", block: { open: "/*", close: "*/" } }, closeBrackets: { brackets: ["(", '"'] } },
  tokenTable: {
    bool: tags.bool,
    definition: tags.definition(tags.variableName),
    builtin: tags.standard(tags.variableName),
    builtinFunction: tags.function(tags.standard(tags.variableName)),
    call: tags.function(tags.variableName),
  },
});

const funky_highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.standard(tags.variableName), color: "var(--tertiary)" },
    { tag: tags.definition(tags.variableName), fontWeight: "600" },
  ])
);

export const funky_language: Extension = [funky, funky_highlight];

const KEYWORD_DOCS: SymbolDoc[] = [
  { name: "var", kind: SymbolKind.KEYWORD, signature: "var name = expression", detail: "A setter: one Funky Trees variable, computed once a tick and shared." },
  { name: "output", kind: SymbolKind.KEYWORD, signature: "output name = expression", detail: "A string to paste into a part's input field." },
  { name: "fn", kind: SymbolKind.KEYWORD, signature: "fn name(a, b) = expression", detail: "A function, inlined at every call. Stateful functions inside get their own state per call." },
  { name: "const", kind: SymbolKind.KEYWORD, signature: "const NAME = expression", detail: "A number worked out before the craft runs and written in where it's used." },
  { name: "@prev", kind: SymbolKind.KEYWORD, signature: "@prev name", detail: "Last tick's value of a var: the back-edge of a feedback loop." },
];

const BUILTIN_DOCS: SymbolDoc[] = [
  ...BUILTIN_VARIABLES.map((entry) => ({ name: entry.name, kind: SymbolKind.VARIABLE, signature: `${entry.name} · ${entry.range}`, detail: entry.detail })),
  ...BUILTIN_FUNCTIONS.map((entry) => ({ name: entry.name, kind: SymbolKind.FUNCTION, signature: entry.signature, detail: entry.detail })),
  ...STDLIB.map((entry) => ({ name: entry.name, kind: SymbolKind.FUNCTION, signature: entry.signature, detail: `${entry.detail} From the library.` })),
  { name: "PI", kind: SymbolKind.CONSTANT, signature: "PI · 3.14159…", detail: "π, folded in when compiled. Trig takes degrees, so it's rarely needed." },
  { name: "E", kind: SymbolKind.CONSTANT, signature: "E · 2.71828…", detail: "Euler's number, folded in when compiled." },
];

export function user_docs(scope: Scope | null): SymbolDoc[] {
  if (!scope) return [];
  return [
    ...[...scope.vars.values()].map((decl) => ({ name: decl.name, kind: SymbolKind.VARIABLE, signature: `var ${decl.name}`, detail: format_dsl(decl.expr) })),
    ...[...scope.consts.values()].map((decl) => ({ name: decl.name, kind: SymbolKind.CONSTANT, signature: `const ${decl.name}`, detail: format_dsl(decl.expr) })),
    ...[...scope.fns.values()].map((decl) => ({
      name: decl.name,
      kind: SymbolKind.FUNCTION,
      signature: `${decl.name}(${decl.params.map((param) => param.name).join(", ")})`,
      detail: format_dsl(decl.body),
    })),
  ];
}

export function all_docs(scope: Scope | null): SymbolDoc[] {
  const user = user_docs(scope);
  const names = new Set(user.map((doc) => doc.name));
  return [...user, ...KEYWORD_DOCS, ...BUILTIN_DOCS.filter((doc) => !names.has(doc.name))];
}
