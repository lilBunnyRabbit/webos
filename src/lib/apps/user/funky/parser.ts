import type { BinaryOp, Decl, Expr, Param, Program, Span } from "./ast";
import { error_at, type Diagnostic } from "./diagnostics";
import { DECLARATION_KEYWORDS, TokenType, tokenize, type Token } from "./lexer";

const BINARY_LEVELS: BinaryOp[][] = [["|"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];

const DECLARATIONS = new Set<string>(DECLARATION_KEYWORDS);

class ParseError extends Error {
  constructor(
    message: string,
    readonly span: Span
  ) {
    super(message);
  }
}

const describe = (token: Token) => (token.type === TokenType.EOF ? "the end" : `"${token.value}"`);

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== TokenType.EOF) this.index++;
    return token;
  }

  private previous_end(): number {
    return this.tokens[Math.max(0, this.index - 1)].span.to;
  }

  private is_punct(value: string): boolean {
    const token = this.peek();
    return token.type === TokenType.PUNCT && token.value === value;
  }

  private expect_punct(value: string, context: string): Token {
    if (!this.is_punct(value)) throw new ParseError(`Expected "${value}" ${context}, found ${describe(this.peek())}`, this.peek().span);
    return this.next();
  }

  private expect_ident(what: string): Token {
    const token = this.peek();
    if (token.type !== TokenType.IDENT) {
      const reason = token.type === TokenType.KEYWORD ? `, but "${token.value}" is a keyword` : `, found ${describe(token)}`;
      throw new ParseError(`Expected ${what}${reason}`, token.span);
    }
    return this.next();
  }

  at_end(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  program(diagnostics: Diagnostic[]): Program {
    const decls: Decl[] = [];
    while (!this.at_end()) {
      const start = this.index;
      try {
        decls.push(this.declaration());
        const after = this.peek();
        if (after.type !== TokenType.EOF && !(after.type === TokenType.KEYWORD && DECLARATIONS.has(after.value))) {
          throw new ParseError(`Unexpected ${describe(after)} after the expression; each declaration starts with const, fn, var or output`, after.span);
        }
      } catch (reason) {
        if (!(reason instanceof ParseError)) throw reason;
        diagnostics.push(error_at(reason.message, reason.span));
        if (this.index === start) this.next();
        this.synchronize();
      }
    }
    return { decls };
  }

  private synchronize(): void {
    while (!this.at_end()) {
      const token = this.peek();
      if (token.type === TokenType.KEYWORD && DECLARATIONS.has(token.value)) return;
      this.next();
    }
  }

  private declaration(): Decl {
    const token = this.peek();
    if (token.type !== TokenType.KEYWORD || !DECLARATIONS.has(token.value)) {
      throw new ParseError(`Expected a declaration (const, fn, var or output), found ${describe(token)}`, token.span);
    }
    const keyword = this.next();
    const from = keyword.span.from;

    if (keyword.value === "fn") {
      const name = this.expect_ident("a function name");
      this.expect_punct("(", "after the function name");
      const params: Param[] = [];
      if (!this.is_punct(")")) {
        do {
          const param = this.expect_ident("a parameter name");
          params.push({ name: param.value, span: param.span });
        } while (this.is_punct(",") && this.next());
      }
      this.expect_punct(")", "to close the parameter list");
      this.expect_punct("=", "before the function body");
      const body = this.expression();
      return { kind: "fn", name: name.value, name_span: name.span, params, body, span: { from, to: this.previous_end() } };
    }

    const kind = keyword.value as "const" | "var" | "output";
    const name = this.expect_ident(kind === "const" ? "a constant name" : kind === "var" ? "a variable name" : "an output name");
    this.expect_punct("=", `after "${name.value}"`);
    const expr = this.expression();
    return { kind, name: name.value, name_span: name.span, expr, span: { from, to: this.previous_end() } };
  }

  expression(): Expr {
    const cond = this.binary(0);
    if (!this.is_punct("?")) return cond;
    this.next();
    const then = this.expression();
    this.expect_punct(":", "in the ternary");
    const otherwise = this.expression();
    return { kind: "ternary", cond, then, otherwise, span: { from: cond.span.from, to: otherwise.span.to } };
  }

  private binary(level: number): Expr {
    if (level >= BINARY_LEVELS.length) return this.unary();
    const ops = BINARY_LEVELS[level];
    const equality = ops.includes("==");
    let left = this.binary(level + 1);
    for (;;) {
      const token = this.peek();
      if (token.type !== TokenType.PUNCT) break;
      const is_raw_equality = equality && token.value === "=";
      if (!is_raw_equality && !ops.includes(token.value as BinaryOp)) break;
      this.next();
      const right = this.binary(level + 1);
      const op = (is_raw_equality ? "==" : token.value) as BinaryOp;
      left = { kind: "binary", op, left, right, span: { from: left.span.from, to: right.span.to } };
    }
    return left;
  }

  private unary(): Expr {
    if (this.is_punct("-") || this.is_punct("!")) {
      const op = this.next();
      const following = this.peek();
      if (op.value === "-" && following.type === TokenType.NUMBER) {
        this.next();
        return { kind: "number", value: -Number(following.value), span: { from: op.span.from, to: following.span.to } };
      }
      const arg = this.unary();
      return { kind: "unary", op: op.value as "-" | "!", arg, span: { from: op.span.from, to: arg.span.to } };
    }
    return this.primary();
  }

  private primary(): Expr {
    const token = this.peek();

    switch (token.type) {
      case TokenType.NUMBER:
        this.next();
        return { kind: "number", value: Number(token.value), span: token.span };
      case TokenType.STRING:
        this.next();
        return { kind: "string", value: token.value, span: token.span };
      case TokenType.PREV: {
        this.next();
        const name = this.expect_ident("a variable name after @prev");
        return { kind: "prev", name: name.value, span: { from: token.span.from, to: name.span.to } };
      }
      case TokenType.KEYWORD:
        if (token.value === "true" || token.value === "false") {
          this.next();
          return { kind: "bool", value: token.value === "true", span: token.span };
        }
        throw new ParseError(`Expected an expression, found the keyword "${token.value}"`, token.span);
      case TokenType.IDENT: {
        this.next();
        if (!this.is_punct("(")) return { kind: "ident", name: token.value, span: token.span };
        this.next();
        const args: Expr[] = [];
        if (!this.is_punct(")")) {
          do args.push(this.expression());
          while (this.is_punct(",") && this.next());
        }
        const close = this.expect_punct(")", `to close the call to ${token.value}`);
        return { kind: "call", callee: token.value, callee_span: token.span, args, span: { from: token.span.from, to: close.span.to } };
      }
      case TokenType.PUNCT:
        if (token.value === "(") {
          this.next();
          const inner = this.expression();
          this.expect_punct(")", "to close the bracket");
          return inner;
        }
    }
    throw new ParseError(`Expected an expression, found ${describe(token)}`, token.span);
  }
}

export interface ParseResult {
  program: Program;
  diagnostics: Diagnostic[];
}

export function parse(source: string): ParseResult {
  const lexed = tokenize(source);
  const diagnostics = [...lexed.diagnostics];
  const program = new Parser(lexed.tokens).program(diagnostics);
  return { program, diagnostics };
}

export interface ExpressionResult {
  expr: Expr | null;
  diagnostics: Diagnostic[];
}

export function parse_expression(source: string): ExpressionResult {
  const lexed = tokenize(source);
  const diagnostics = [...lexed.diagnostics];
  const parser = new Parser(lexed.tokens);
  try {
    const expr = parser.expression();
    if (!parser.at_end()) {
      const rest = parser.peek();
      diagnostics.push(error_at(`Unexpected "${rest.value}" after the expression`, rest.span));
    }
    return { expr, diagnostics };
  } catch (reason) {
    if (!(reason instanceof ParseError)) throw reason;
    diagnostics.push(error_at(reason.message, reason.span));
    return { expr: null, diagnostics };
  }
}
