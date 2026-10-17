import { each_node, type Expr, type FnDecl, type Span } from "./ast";
import { STATEFUL_FUNCTIONS, VARIABLES_BY_NAME } from "./builtins";
import { Severity, error_at, has_errors, info_at, warn_at, type Diagnostic } from "./diagnostics";
import { debug_expression, print_ft, variables_xml } from "./emit";
import { order_vars, type Node } from "./graph";
import { parse, parse_expression } from "./parser";
import { check_expression, resolve, type Scope } from "./resolve";
import { STDLIB_SOURCE } from "./stdlib";
import { contains_stateful, fold, inline, type InlineStats } from "./transform";

export interface Compiled {
  name: string;
  span: Span;
  expr: Expr;
  ft: string;
  debug: string;
}

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  setters: Compiled[];
  outputs: Compiled[];
  constants: Compiled[];
  xml: string;
  builtins: string[];
  scope: Scope;
}

let stdlib_fns: FnDecl[] | null = null;

export function stdlib(): FnDecl[] {
  return (stdlib_fns ??= parse(STDLIB_SOURCE).program.decls.filter((decl): decl is FnDecl => decl.kind === "fn"));
}

function reads(expr: Expr): { now: Set<string>; prev: Set<string> } {
  const now = new Set<string>();
  const prev = new Set<string>();
  each_node(expr, (node) => {
    if (node.kind === "ident") now.add(node.name);
    else if (node.kind === "prev") prev.add(node.name);
  });
  return { now, prev };
}

function referenced_builtins(exprs: Expr[]): string[] {
  const found = new Set<string>();
  for (const expr of exprs) each_node(expr, (node) => node.kind === "ident" && VARIABLES_BY_NAME.has(node.name) && found.add(node.name));
  return [...found];
}

const compiled = (name: string, span: Span, expr: Expr): Compiled => {
  const ft = print_ft(expr);
  return { name, span, expr, ft, debug: debug_expression(ft) };
};

function repeated_subexpressions(entries: Compiled[], diagnostics: Diagnostic[]): void {
  const seen = new Map<string, { count: number; first: Compiled; stateful: boolean }>();
  for (const entry of entries) {
    each_node(entry.expr, (node) => {
      if (node.kind !== "binary" && node.kind !== "call" && node.kind !== "ternary") return;
      let size = 0;
      each_node(node, () => size++);
      if (size < 5) return;
      const key = print_ft(node);
      const found = seen.get(key);
      if (found) found.count++;
      else seen.set(key, { count: 1, first: entry, stateful: contains_stateful(node) });
    });
  }
  let shown = 0;
  for (const [key, { count, first, stateful }] of seen) {
    if (count < 2 || shown >= 4) continue;
    shown++;
    const short = key.length > 48 ? `${key.slice(0, 47)}…` : key;
    const note = stateful ? " It holds a stateful function, so a var would share one state between the uses." : "";
    diagnostics.push(info_at(`${short} is worked out ${count} times; a var would compute it once.${note}`, first.span));
  }
}

export function compile(source: string): CompileResult {
  const parsed = parse(source);
  const resolved = resolve(parsed.program, stdlib());
  const diagnostics = [...parsed.diagnostics, ...resolved.diagnostics];
  const { scope } = resolved;
  const empty: CompileResult = { ok: false, diagnostics, setters: [], outputs: [], constants: [], xml: "", builtins: [], scope };

  const decls = parsed.program.decls;
  if (!decls.some((decl) => decl.kind === "var" || decl.kind === "output")) {
    diagnostics.push(warn_at("Nothing to emit: add a var (a setter) or an output (a part's input). const and fn only count once something uses them."));
  }
  if (has_errors(diagnostics)) return empty;

  const stats: InlineStats = { calls: new Map() };
  const build = (expr: Expr) => fold(inline(expr, scope, stats));
  const vars = [...scope.vars.values()].map((decl) => ({ decl, expr: build(decl.expr) }));
  const outputs = [...scope.outputs.values()].map((decl) => compiled(decl.name, decl.name_span, build(decl.expr)));
  const constants = [...scope.consts.values()].map((decl) => compiled(decl.name, decl.name_span, build(decl.expr)));

  const nodes: Node[] = vars.map(({ decl, expr }) => {
    const { now, prev } = reads(expr);
    if (now.has(decl.name)) diagnostics.push(error_at(`var "${decl.name}" reads itself. Write @prev ${decl.name} to use last tick's value.`, decl.name_span));
    for (const name of now) {
      if (prev.has(name) && name !== decl.name) {
        diagnostics.push(
          error_at(`var "${decl.name}" reads ${name} both this tick and through @prev. Copy last tick's value into its own var first: var last_${name} = @prev ${name}`, decl.name_span)
        );
      }
    }
    return { name: decl.name, reads: now, prev_reads: prev };
  });
  const { order, cycle } = order_vars(nodes);
  if (cycle.length && !has_errors(diagnostics)) {
    const first = scope.vars.get(cycle[0])!;
    diagnostics.push(
      error_at(
        `These vars need each other this tick: ${cycle.join(" → ")}. Mark one read with @prev to take last tick's value instead.`,
        first.name_span
      )
    );
  }

  for (const [name, sites] of stats.calls) {
    const fn = scope.fns.get(name) ?? scope.stdlib.get(name);
    if (sites.length < 2 || !fn || !has_stateful_call(fn, scope)) continue;
    const span = scope.fns.has(name) ? fn.name_span : sites[1];
    diagnostics.push(
      warn_at(`"${name}" holds a stateful function and is used ${sites.length} times: each use keeps its own state. Use a var for one shared state.`, span)
    );
  }

  if (has_errors(diagnostics)) return empty;

  const by_name = new Map(vars.map((entry) => [entry.decl.name, entry]));
  const setters = order.map((name) => {
    const { decl, expr } = by_name.get(name)!;
    return compiled(name, decl.name_span, expr);
  });
  repeated_subexpressions([...setters, ...outputs], diagnostics);

  return {
    ok: true,
    diagnostics,
    setters,
    outputs,
    constants,
    xml: variables_xml(setters),
    builtins: referenced_builtins([...setters, ...outputs].map((entry) => entry.expr)),
    scope,
  };
}

function has_stateful_call(fn: FnDecl, scope: Scope): boolean {
  let found = false;
  each_node(fn.body, (node) => {
    if (node.kind !== "call") return;
    if (STATEFUL_FUNCTIONS.has(node.callee)) found = true;
    const inner = scope.fns.get(node.callee) ?? scope.stdlib.get(node.callee);
    if (inner && inner !== fn && has_stateful_call(inner, scope)) found = true;
  });
  return found;
}

export interface WatchResult {
  expr: Expr | null;
  ft: string;
  error: string | null;
  builtins: string[];
}

export function compile_watch(source: string, scope: Scope): WatchResult {
  const parsed = parse_expression(source);
  const errors = parsed.expr ? [...parsed.diagnostics, ...check_expression(parsed.expr, scope)] : parsed.diagnostics;
  const error = errors.find((diagnostic) => diagnostic.severity === Severity.ERROR) ?? (parsed.expr ? null : errors[0]);
  if (!parsed.expr || error) return { expr: null, ft: "", error: error?.message ?? "Couldn't read the expression", builtins: [] };
  const expr = fold(inline(parsed.expr, scope, { calls: new Map() }));
  return { expr, ft: print_ft(expr), error: null, builtins: referenced_builtins([expr]) };
}
