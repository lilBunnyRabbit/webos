import { z } from "zod";
import { InputError, InputKind, random_int, shuffled, type InputSpec } from "./inputs";
import type { Point } from "./step";

export interface GraphInput {
  directed: boolean;
  nodes: { id: string; x: number; y: number }[];
  edges: { from: string; to: string; w: number }[];
  start?: string;
  goal?: string;
}

export const GRAPH_SCHEMA = z.object({
  directed: z.boolean(),
  nodes: z.array(z.object({ id: z.string().min(1).max(4), x: z.number(), y: z.number() })).max(40),
  edges: z.array(z.object({ from: z.string(), to: z.string(), w: z.number() })).max(200),
  start: z.string().optional(),
  goal: z.string().optional(),
});

export interface GraphRules {
  directed: boolean;
  weighted: boolean;
  negative?: boolean;
  start?: boolean;
  goal?: boolean;
  names?: { start: string; goal: string };
}

const EDGE = /^([A-Za-z0-9]{1,4})\s*(->|-)\s*([A-Za-z0-9]{1,4})(?:\s+(-?\d+(?:\.\d+)?))?$/;

export function circle_layout(ids: string[]): Map<string, Point> {
  const radius = 40;
  return new Map(
    ids.map((id, index) => {
      const angle = (index / Math.max(1, ids.length)) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: Math.round(50 + radius * Math.cos(angle)), y: Math.round(50 + radius * Math.sin(angle)) }];
    })
  );
}

export function validate_graph(graph: GraphInput, rules: GraphRules): GraphInput {
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (graph.nodes.length < 2) throw new InputError("A graph needs at least two nodes.");
  if (ids.size !== graph.nodes.length) throw new InputError("Every node needs its own name.");
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new InputError(`Edge ${edge.from}–${edge.to} names a node that isn't there.`);
    if (edge.from === edge.to) throw new InputError("No edges from a node to itself.");
    if (!rules.negative && edge.w < 0) throw new InputError("Weights can't be negative here.");
  }
  const names = rules.names ?? { start: "start", goal: "goal" };
  if (rules.start && (!graph.start || !ids.has(graph.start))) throw new InputError(`Pick a ${names.start} node.`);
  if (rules.goal && (!graph.goal || !ids.has(graph.goal))) throw new InputError(`Pick a ${names.goal} node.`);
  return { ...graph, directed: rules.directed };
}

export function format_graph(graph: GraphInput, rules: GraphRules): string {
  const arrow = graph.directed ? "->" : "-";
  const edges = graph.edges.map((edge) => `${edge.from}${arrow}${edge.to}${rules.weighted ? ` ${edge.w}` : ""}`).join(", ");
  const names = rules.names ?? { start: "start", goal: "goal" };
  const parts = [edges];
  if (rules.start && graph.start) parts.push(`${names.start} ${graph.start}`);
  if (rules.goal && graph.goal) parts.push(`${names.goal} ${graph.goal}`);
  return parts.join("; ");
}

export function parse_graph(text: string, rules: GraphRules, previous?: GraphInput): GraphInput {
  const [edge_part, ...rest] = text.split(";");
  const order: string[] = [];
  const edges: GraphInput["edges"] = [];
  for (const token of edge_part.split(",").map((part) => part.trim()).filter(Boolean)) {
    const match = EDGE.exec(token);
    if (!match) throw new InputError(`Can't read “${token}”. Write edges like A-B 4, or A->B 4 when they point one way.`);
    const [, from, , to, weight] = match;
    for (const id of [from, to]) if (!order.includes(id)) order.push(id);
    edges.push({ from, to, w: weight === undefined ? 1 : Number(weight) });
  }
  const names = rules.names ?? { start: "start", goal: "goal" };
  let start: string | undefined;
  let goal: string | undefined;
  for (const part of rest) {
    const [key, value] = part.trim().split(/\s+/);
    if (!key) continue;
    if (key === names.start) start = value;
    else if (key === names.goal) goal = value;
    else throw new InputError(`Unknown part “${key}”: use ${names.start}${rules.goal ? ` or ${names.goal}` : ""}.`);
  }
  const kept = new Map(previous?.nodes.map((node) => [node.id, node]) ?? []);
  const fresh = circle_layout(order);
  const nodes = order.map((id) => kept.get(id) ?? { id, ...fresh.get(id)! });
  return validate_graph({ directed: rules.directed, nodes, edges, start: start ?? (rules.start ? order[0] : undefined), goal: goal ?? (rules.goal ? order.at(-1) : undefined) }, rules);
}

export function random_graph(rules: GraphRules, count = 7): GraphInput {
  const ids = "ABCDEFGHIJ".slice(0, count).split("");
  const positions = ids.map((id, index) => ({
    id,
    x: Math.round(10 + ((index % 4) * 80) / 3 + random_int(-6, 6)),
    y: Math.round(15 + Math.floor(index / 4) * 60 + random_int(-8, 8)),
  }));
  const edges: GraphInput["edges"] = [];
  const has = (a: string, b: string) => edges.some((edge) => (edge.from === a && edge.to === b) || (!rules.directed && edge.from === b && edge.to === a));
  const weight = () => (rules.weighted ? random_int(rules.negative ? -2 : 1, 9) : 1);
  for (let i = 1; i < ids.length; i++) {
    const j = random_int(0, i - 1);
    edges.push(rules.directed ? { from: ids[j], to: ids[i], w: Math.abs(weight()) || 1 } : { from: ids[j], to: ids[i], w: weight() });
  }
  for (const [a, b] of shuffled(ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as const))).slice(0, count)) {
    if (has(a, b)) continue;
    const forward = rules.directed ? Math.random() < 0.5 : true;
    edges.push(forward ? { from: a, to: b, w: weight() } : { from: b, to: a, w: weight() });
  }
  return { directed: rules.directed, nodes: positions, edges, start: rules.start ? ids[0] : undefined, goal: rules.goal ? ids.at(-1) : undefined };
}

export function graph(rules: GraphRules, sample: GraphInput): InputSpec<GraphInput> {
  return {
    kind: InputKind.GRAPH,
    hint: `Edges like A${rules.directed ? "->" : "-"}B${rules.weighted ? " 4" : ""}, comma separated${rules.start ? `; ${(rules.names ?? { start: "start" }).start} A` : ""}${rules.goal ? `; ${(rules.names ?? { goal: "goal" }).goal} F` : ""}. Or draw it.`,
    schema: GRAPH_SCHEMA.transform((value) => validate_graph(value, rules)) as unknown as z.ZodType<GraphInput>,
    parse: (text) => parse_graph(text, rules),
    format: (value) => format_graph(value, rules),
    random: () => random_graph(rules),
    sample: validate_graph(sample, rules),
  };
}

export function sample_graph(rules: GraphRules, text: string, positions: Record<string, [number, number]>): GraphInput {
  const parsed = parse_graph(text, rules);
  return { ...parsed, nodes: parsed.nodes.map((node) => (positions[node.id] ? { id: node.id, x: positions[node.id][0], y: positions[node.id][1] } : node)) };
}

export const POINTS_SCHEMA = z.array(z.object({ x: z.number(), y: z.number() })).min(2).max(60);

export function points(sample: Point[], options: { min?: number; max?: number } = {}): InputSpec<Point[]> {
  const min = options.min ?? 3;
  const max = options.max ?? 40;
  const check = (values: Point[]) => {
    if (values.length < min) throw new InputError(`At least ${min} points.`);
    if (values.length > max) throw new InputError(`At most ${max} points.`);
    if (values.some((point) => point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100)) throw new InputError("Coordinates from 0 to 100.");
    return values;
  };
  return {
    kind: InputKind.POINTS,
    hint: "Points as x y pairs from 0 to 100, comma separated: 10 20, 40 80. Or click to add.",
    schema: POINTS_SCHEMA as z.ZodType<Point[]>,
    parse: (text) => {
      const values = text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [x, y, extra] = part.split(/\s+/).map(Number);
          if (extra !== undefined || !Number.isFinite(x) || !Number.isFinite(y)) throw new InputError(`Can't read “${part}”: write x y.`);
          return { x, y };
        });
      return check(values);
    },
    format: (values) => values.map((point) => `${point.x} ${point.y}`).join(", "),
    random: () => Array.from({ length: Math.min(max, 14) }, () => ({ x: random_int(5, 95), y: random_int(5, 95) })),
    sample,
  };
}
