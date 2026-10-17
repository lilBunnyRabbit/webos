import type { Call, ConstDecl, Decl, Expr, FnDecl, OutputDecl, Program, VarDecl } from "./ast";
import { children } from "./ast";
import { BUILTIN_CONSTANTS, FUNCTIONS_BY_NAME, VARIABLES_BY_NAME, count_text } from "./builtins";
import { error_at, warn_at, type Diagnostic } from "./diagnostics";

export interface Scope {
  consts: Map<string, ConstDecl>;
  fns: Map<string, FnDecl>;
  vars: Map<string, VarDecl>;
  outputs: Map<string, OutputDecl>;
  stdlib: Map<string, FnDecl>;
}

export interface Resolved {
  scope: Scope;
  diagnostics: Diagnostic[];
}

const KIND_LABEL: Record<Decl["kind"], string> = { const: "const", fn: "fn", var: "var", output: "output" };

function distance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const table = Array.from({ length: x.length + 1 }, (_, i) => Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
    }
  }
  return table[x.length][y.length];
}

export function suggest(name: string, candidates: Iterable<string>): string {
  let best = "";
  let best_distance = Infinity;
  for (const candidate of candidates) {
    const score = distance(name, candidate);
    if (score < best_distance) {
      best = candidate;
      best_distance = score;
    }
  }
  return best && best_distance <= Math.max(1, Math.floor(name.length / 3)) ? ` Did you mean "${best}"?` : "";
}

export function lookup_fn(scope: Scope, name: string): FnDecl | undefined {
  return scope.fns.get(name) ?? scope.stdlib.get(name);
}

interface Context {
  scope: Scope;
  diagnostics: Diagnostic[];
  params: Set<string> | null;
  owner: Decl;
}

function value_names(scope: Scope): string[] {
  return [...scope.consts.keys(), ...scope.vars.keys(), ...VARIABLES_BY_NAME.keys(), ...Object.keys(BUILTIN_CONSTANTS)];
}

function check_call(call: Call, context: Context): void {
  const { scope, diagnostics } = context;
  const user = lookup_fn(scope, call.callee);
  const builtin = FUNCTIONS_BY_NAME.get(call.callee);
  const expected = user ? user.params.length : builtin?.arity;
  if (expected === undefined) {
    const value = context.params?.has(call.callee) || scope.consts.has(call.callee) || scope.vars.has(call.callee) || VARIABLES_BY_NAME.has(call.callee);
    const message = value
      ? `"${call.callee}" is a value, not a function`
      : `Unknown function "${call.callee}".${suggest(call.callee, [...scope.fns.keys(), ...scope.stdlib.keys(), ...FUNCTIONS_BY_NAME.keys()])}`;
    diagnostics.push(error_at(message.trim(), call.callee_span));
    return;
  }
  if (call.args.length < expected) {
    const missing = user ? user.params.slice(call.args.length).map((param) => param.name) : [];
    const detail = missing.length ? ` (missing ${missing.join(", ")})` : "";
    diagnostics.push(error_at(`"${call.callee}" takes ${count_text(expected)}, got ${call.args.length}${detail}`, call.span));
  } else if (call.args.length > expected) {
    const extra = call.args[expected];
    diagnostics.push(
      error_at(`"${call.callee}" takes ${count_text(expected)}, got ${call.args.length}`, { from: extra.span.from, to: call.args[call.args.length - 1].span.to })
    );
  }
}

function check_expr(expr: Expr, context: Context): void {
  const { scope, diagnostics, owner } = context;
  switch (expr.kind) {
    case "ident": {
      const name = expr.name;
      if (context.params?.has(name)) break;
      if (scope.consts.has(name) || name in BUILTIN_CONSTANTS) break;
      if (scope.vars.has(name)) {
        if (owner.kind === "const") diagnostics.push(error_at(`const "${owner.name}" can't read var "${name}": a const is worked out before the craft runs. Use a var.`, expr.span));
        break;
      }
      const builtin = VARIABLES_BY_NAME.get(name);
      if (builtin) {
        if (owner.kind === "const") diagnostics.push(error_at(`const "${owner.name}" can't read ${name}: a const is worked out before the craft runs. Use a var.`, expr.span));
        else if (builtin.deprecated) diagnostics.push(warn_at(`${name} is the old name; use ${builtin.deprecated}`, expr.span));
        break;
      }
      if (lookup_fn(scope, name) || FUNCTIONS_BY_NAME.has(name)) {
        diagnostics.push(error_at(`"${name}" is a function; call it with ${name}(…)`, expr.span));
        break;
      }
      if (scope.outputs.has(name)) {
        diagnostics.push(error_at(`Output "${name}" can't be read: outputs go to parts. Make it a var to share it.`, expr.span));
        break;
      }
      const names = context.params ? [...context.params, ...value_names(scope)] : value_names(scope);
      diagnostics.push(error_at(`Unknown name "${name}".${suggest(name, names)}`.trim(), expr.span));
      break;
    }
    case "prev":
      if (owner.kind === "const") diagnostics.push(error_at("@prev can't be used in a const", expr.span));
      else if (!scope.vars.has(expr.name)) {
        diagnostics.push(error_at(`@prev needs a var; "${expr.name}" isn't one.${suggest(expr.name, scope.vars.keys())}`.trim(), expr.span));
      } else if (owner.kind === "output") {
        diagnostics.push(warn_at(`@prev in an output reads this tick's ${expr.name}: parts run after every setter`, expr.span));
      }
      break;
    case "call":
      check_call(expr, context);
      break;
  }
  for (const child of children(expr)) check_expr(child, context);
}

function collect_calls(expr: Expr, into: Call[]): Call[] {
  if (expr.kind === "call") into.push(expr);
  for (const child of children(expr)) collect_calls(child, into);
  return into;
}

function check_recursion(fns: FnDecl[], scope: Scope, diagnostics: Diagnostic[]): void {
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<Call>();
  const visit = (fn: FnDecl, stack: FnDecl[]) => {
    state.set(fn.name, "visiting");
    for (const call of collect_calls(fn.body, [])) {
      const target = lookup_fn(scope, call.callee);
      if (!target) continue;
      const status = state.get(target.name);
      if (status === "visiting") {
        if (!reported.has(call) && fns.includes(fn)) {
          reported.add(call);
          const path = [...stack.slice(stack.indexOf(target)), fn, target].map((entry) => entry.name);
          diagnostics.push(error_at(`Recursive call: ${[...new Set(path)].join(" → ")} → ${target.name}. Functions are inlined, so they can't call themselves.`, call.callee_span));
        }
      } else if (status !== "done") visit(target, [...stack, fn]);
    }
    state.set(fn.name, "done");
  };
  for (const fn of fns) if (!state.has(fn.name)) visit(fn, []);
}

function check_const_cycles(consts: ConstDecl[], scope: Scope, diagnostics: Diagnostic[]): void {
  const done = new Set<string>();
  const reported = new Set<string>();
  const visit = (decl: ConstDecl, stack: string[]) => {
    const walk = (expr: Expr) => {
      const target = expr.kind === "ident" ? scope.consts.get(expr.name) : undefined;
      if (target && stack.includes(target.name)) {
        const cycle = [...stack.slice(stack.indexOf(target.name)), target.name];
        const key = [...new Set(cycle)].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          diagnostics.push(error_at(`Constant cycle: ${cycle.join(" → ")}`, expr.span));
        }
      } else if (target && !done.has(target.name)) visit(target, [...stack, target.name]);
      children(expr).forEach(walk);
    };
    walk(decl.expr);
    done.add(decl.name);
  };
  for (const decl of consts) if (!done.has(decl.name)) visit(decl, [decl.name]);
}

export function resolve(program: Program, stdlib: FnDecl[]): Resolved {
  const diagnostics: Diagnostic[] = [];
  const scope: Scope = { consts: new Map(), fns: new Map(), vars: new Map(), outputs: new Map(), stdlib: new Map() };
  const declared = new Map<string, Decl>();

  for (const decl of program.decls) {
    const earlier = declared.get(decl.name);
    if (earlier) {
      diagnostics.push(error_at(`"${decl.name}" is already declared as a ${KIND_LABEL[earlier.kind]}`, decl.name_span));
      continue;
    }
    declared.set(decl.name, decl);
    if (decl.kind === "fn") {
      if (FUNCTIONS_BY_NAME.has(decl.name)) diagnostics.push(error_at(`fn "${decl.name}" has the name of a built-in function`, decl.name_span));
      scope.fns.set(decl.name, decl);
    } else {
      if (VARIABLES_BY_NAME.has(decl.name) || decl.name in BUILTIN_CONSTANTS) {
        diagnostics.push(error_at(`${KIND_LABEL[decl.kind]} "${decl.name}" has the name of a built-in`, decl.name_span));
      }
      if (decl.kind === "const") scope.consts.set(decl.name, decl);
      else if (decl.kind === "var") scope.vars.set(decl.name, decl);
      else scope.outputs.set(decl.name, decl);
    }
  }

  for (const fn of stdlib) {
    const user = scope.fns.get(fn.name);
    if (user) diagnostics.push(warn_at(`fn "${fn.name}" replaces the library function of the same name`, user.name_span));
    else scope.stdlib.set(fn.name, fn);
  }

  for (const decl of program.decls) {
    if (declared.get(decl.name) !== decl) continue;
    if (decl.kind === "fn") {
      const params = new Set<string>();
      for (const param of decl.params) {
        if (params.has(param.name)) diagnostics.push(error_at(`Parameter "${param.name}" appears twice`, param.span));
        else if (VARIABLES_BY_NAME.has(param.name)) diagnostics.push(error_at(`Parameter "${param.name}" hides the built-in ${param.name}`, param.span));
        params.add(param.name);
      }
      check_expr(decl.body, { scope, diagnostics, params, owner: decl });
    } else {
      check_expr(decl.expr, { scope, diagnostics, params: null, owner: decl });
    }
  }

  check_recursion([...scope.fns.values()], scope, diagnostics);
  check_const_cycles([...scope.consts.values()], scope, diagnostics);
  return { scope, diagnostics };
}

export function check_expression(expr: Expr, scope: Scope): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const owner: VarDecl = { kind: "var", name: "", name_span: expr.span, expr, span: expr.span };
  check_expr(expr, { scope, diagnostics, params: null, owner });
  return diagnostics;
}
