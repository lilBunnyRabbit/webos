export interface Span {
  from: number;
  to: number;
}

export type Expr = NumberLit | BoolLit | StringLit | Ident | PrevRef | Unary | Binary | Ternary | Call;

export interface NumberLit {
  kind: "number";
  value: number;
  span: Span;
}

export interface BoolLit {
  kind: "bool";
  value: boolean;
  span: Span;
}

export interface StringLit {
  kind: "string";
  value: string;
  span: Span;
}

export interface Ident {
  kind: "ident";
  name: string;
  span: Span;
}

/** `@prev name`: last tick's value of a var, the back-edge of a feedback loop. */
export interface PrevRef {
  kind: "prev";
  name: string;
  span: Span;
}

export type UnaryOp = "-" | "!";

export interface Unary {
  kind: "unary";
  op: UnaryOp;
  arg: Expr;
  span: Span;
}

export type BinaryOp = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "&" | "|";

export interface Binary {
  kind: "binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
  span: Span;
}

export interface Ternary {
  kind: "ternary";
  cond: Expr;
  then: Expr;
  otherwise: Expr;
  span: Span;
}

export interface Call {
  kind: "call";
  callee: string;
  callee_span: Span;
  args: Expr[];
  span: Span;
}

export interface Param {
  name: string;
  span: Span;
}

export interface ConstDecl {
  kind: "const";
  name: string;
  name_span: Span;
  expr: Expr;
  span: Span;
}

export interface FnDecl {
  kind: "fn";
  name: string;
  name_span: Span;
  params: Param[];
  body: Expr;
  span: Span;
}

export interface VarDecl {
  kind: "var";
  name: string;
  name_span: Span;
  expr: Expr;
  span: Span;
}

export interface OutputDecl {
  kind: "output";
  name: string;
  name_span: Span;
  expr: Expr;
  span: Span;
}

export type Decl = ConstDecl | FnDecl | VarDecl | OutputDecl;

export interface Program {
  decls: Decl[];
}

export function children(expr: Expr): Expr[] {
  switch (expr.kind) {
    case "unary":
      return [expr.arg];
    case "binary":
      return [expr.left, expr.right];
    case "ternary":
      return [expr.cond, expr.then, expr.otherwise];
    case "call":
      return expr.args;
    default:
      return [];
  }
}

export function each_node(expr: Expr, visit: (node: Expr) => void): void {
  visit(expr);
  for (const child of children(expr)) each_node(child, visit);
}

export function same_expr(a: Expr, b: Expr): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "number":
    case "bool":
    case "string":
      return a.value === (b as typeof a).value;
    case "ident":
    case "prev":
      return a.name === (b as typeof a).name;
    case "unary":
      return a.op === (b as typeof a).op && same_expr(a.arg, (b as typeof a).arg);
    case "binary": {
      const other = b as typeof a;
      return a.op === other.op && same_expr(a.left, other.left) && same_expr(a.right, other.right);
    }
    case "ternary": {
      const other = b as typeof a;
      return same_expr(a.cond, other.cond) && same_expr(a.then, other.then) && same_expr(a.otherwise, other.otherwise);
    }
    case "call": {
      const other = b as typeof a;
      return a.callee === other.callee && a.args.length === other.args.length && a.args.every((arg, index) => same_expr(arg, other.args[index]));
    }
  }
}
