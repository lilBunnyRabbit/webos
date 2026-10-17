import type { Expr, Span } from "./ast";
import { BUILTIN_CONSTANTS, STATEFUL_FUNCTIONS } from "./builtins";
import { PURE } from "./math";
import { lookup_fn, type Scope } from "./resolve";

export interface InlineStats {
  calls: Map<string, Span[]>;
}

/** Inlined body nodes take the call's span: a stdlib body's own offsets mean nothing in the user's source. */
function respan(expr: Expr, span: Span): Expr {
  switch (expr.kind) {
    case "unary":
      return { ...expr, arg: respan(expr.arg, span), span };
    case "binary":
      return { ...expr, left: respan(expr.left, span), right: respan(expr.right, span), span };
    case "ternary":
      return { ...expr, cond: respan(expr.cond, span), then: respan(expr.then, span), otherwise: respan(expr.otherwise, span), span };
    case "call":
      return { ...expr, args: expr.args.map((arg) => respan(arg, span)), callee_span: span, span };
    default:
      return { ...expr, span };
  }
}

/** Expects a program `resolve` accepted: every name and call is known and every arity matches. */
export function inline(expr: Expr, scope: Scope, stats: InlineStats, params?: Map<string, Expr>, user_site?: Span): Expr {
  switch (expr.kind) {
    case "ident": {
      const bound = params?.get(expr.name);
      if (bound) return bound;
      if (expr.name in BUILTIN_CONSTANTS) return { kind: "number", value: BUILTIN_CONSTANTS[expr.name], span: expr.span };
      const constant = scope.consts.get(expr.name);
      if (constant) return respan(inline(constant.expr, scope, stats), expr.span);
      return expr;
    }
    case "unary":
      return { ...expr, arg: inline(expr.arg, scope, stats, params, user_site) };
    case "binary":
      return { ...expr, left: inline(expr.left, scope, stats, params, user_site), right: inline(expr.right, scope, stats, params, user_site) };
    case "ternary":
      return {
        ...expr,
        cond: inline(expr.cond, scope, stats, params, user_site),
        then: inline(expr.then, scope, stats, params, user_site),
        otherwise: inline(expr.otherwise, scope, stats, params, user_site),
      };
    case "call": {
      const args = expr.args.map((arg) => inline(arg, scope, stats, params, user_site));
      const fn = lookup_fn(scope, expr.callee);
      if (!fn) return { ...expr, args };
      const site = user_site ?? expr.span;
      const sites = stats.calls.get(fn.name) ?? [];
      sites.push(site);
      stats.calls.set(fn.name, sites);
      const bound = new Map(fn.params.map((param, index) => [param.name, args[index]]));
      return inline(respan(fn.body, site), scope, stats, bound, site);
    }
    default:
      return expr;
  }
}

export function contains_stateful(expr: Expr): boolean {
  if (expr.kind === "call" && STATEFUL_FUNCTIONS.has(expr.callee)) return true;
  switch (expr.kind) {
    case "unary":
      return contains_stateful(expr.arg);
    case "binary":
      return contains_stateful(expr.left) || contains_stateful(expr.right);
    case "ternary":
      return contains_stateful(expr.cond) || contains_stateful(expr.then) || contains_stateful(expr.otherwise);
    case "call":
      return expr.args.some(contains_stateful);
    default:
      return false;
  }
}

export function fold(expr: Expr): Expr {
  switch (expr.kind) {
    case "unary": {
      const arg = fold(expr.arg);
      if (expr.op === "-" && arg.kind === "number") return { kind: "number", value: -arg.value, span: expr.span };
      return { ...expr, arg };
    }
    case "binary": {
      const left = fold(expr.left);
      const right = fold(expr.right);
      if (left.kind === "number" && right.kind === "number") {
        const a = left.value;
        const b = right.value;
        let value: number | null = null;
        if (expr.op === "+") value = a + b;
        else if (expr.op === "-") value = a - b;
        else if (expr.op === "*") value = a * b;
        else if (expr.op === "/" && b !== 0) value = a / b;
        if (value !== null && Number.isFinite(value)) return { kind: "number", value, span: expr.span };
      }
      return { ...expr, left, right };
    }
    case "ternary":
      return { ...expr, cond: fold(expr.cond), then: fold(expr.then), otherwise: fold(expr.otherwise) };
    case "call": {
      const args = expr.args.map(fold);
      const pure = PURE[expr.callee];
      if (pure && args.every((arg) => arg.kind === "number")) {
        const value = pure(args.map((arg) => (arg as { value: number }).value));
        if (Number.isFinite(value)) return { kind: "number", value, span: expr.span };
      }
      return { ...expr, args };
    }
    default:
      return expr;
  }
}
