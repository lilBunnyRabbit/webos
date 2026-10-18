import { describe, expect, test } from "vitest";
import { record, type Definition } from "../../engine/definition";
import { random_graph, type GraphInput, type GraphRules } from "../../engine/graph-input";
import graphs from "./index";

const run = <R>(id: string, input: GraphInput) => {
  const recording = record(graphs[id] as Definition<GraphInput, R>, input, {});
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

function reference_shortest(input: GraphInput, start: string): Record<string, number> {
  const dist: Record<string, number> = Object.fromEntries(input.nodes.map((node) => [node.id, Infinity]));
  dist[start] = 0;
  for (let i = 0; i < input.nodes.length; i++)
    for (const edge of input.edges) {
      if (dist[edge.from] + edge.w < dist[edge.to]) dist[edge.to] = dist[edge.from] + edge.w;
      if (!input.directed && dist[edge.to] + edge.w < dist[edge.from]) dist[edge.from] = dist[edge.to] + edge.w;
    }
  return dist;
}

function reference_mst(input: GraphInput): number {
  const parent = new Map(input.nodes.map((node) => [node.id, node.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  let total = 0;
  for (const edge of [...input.edges].sort((a, b) => a.w - b.w)) {
    const [a, b] = [find(edge.from), find(edge.to)];
    if (a !== b) {
      parent.set(a, b);
      total += edge.w;
    }
  }
  return total;
}

const randoms = (rules: GraphRules, count = 30) => Array.from({ length: count }, () => random_graph(rules, 4 + Math.floor(Math.random() * 6)));

describe("shortest paths", () => {
  test("BFS distances count edges", () => {
    for (const input of randoms({ directed: false, weighted: false, start: true })) {
      const unit = { ...input, edges: input.edges.map((edge) => ({ ...edge, w: 1 })) };
      const expected = reference_shortest(unit, input.start!);
      const { dist } = run<{ dist: Record<string, number> }>("bfs", unit);
      for (const [id, value] of Object.entries(expected)) expect(dist[id] ?? Infinity).toBe(value);
    }
  });

  test("DFS visits every reachable node once, finishing after discovering", () => {
    for (const input of randoms({ directed: false, weighted: false, start: true })) {
      const { order, discovered, finished } = run<{ order: string[]; discovered: Record<string, number>; finished: Record<string, number> }>("dfs", input);
      expect(new Set(order).size).toBe(order.length);
      const reachable = Object.entries(reference_shortest({ ...input, edges: input.edges.map((edge) => ({ ...edge, w: 1 })) }, input.start!)).filter(([, d]) => d < Infinity);
      expect(order.length).toBe(reachable.length);
      for (const id of order) expect(finished[id]).toBeGreaterThan(discovered[id]);
    }
  });

  test("Dijkstra matches Bellman-Ford's reference", () => {
    for (const input of randoms({ directed: false, weighted: true, start: true })) {
      const { dist } = run<{ dist: Record<string, number> }>("dijkstra", input);
      expect(dist).toEqual(reference_shortest(input, input.start!));
    }
  });

  test("A* finds a shortest path's cost", () => {
    for (const input of randoms({ directed: false, weighted: true, start: true, goal: true })) {
      const { cost, path } = run<{ cost: number; path: string[] }>("a-star", input);
      expect(cost).toBe(reference_shortest(input, input.start!)[input.goal!]);
      if (cost < Infinity) {
        expect(path[0]).toBe(input.start);
        expect(path.at(-1)).toBe(input.goal);
      }
    }
  });

  test("Bellman-Ford handles negative edges and finds negative cycles", () => {
    const definition = graphs["bellman-ford"] as Definition<GraphInput, { dist: Record<string, number> | null; negative_cycle: boolean }>;
    const plain = run<{ dist: Record<string, number> }>("bellman-ford", definition.input.sample);
    expect(plain.dist).toEqual({ A: 0, B: 2, C: 7, D: 4, E: -2 });
    const cycle = run<{ negative_cycle: boolean }>("bellman-ford", definition.presets![0].value);
    expect(cycle.negative_cycle).toBe(true);
  });

  test("Floyd-Warshall agrees with a single-source reference from every node", () => {
    for (const input of randoms({ directed: true, weighted: true })) {
      const { matrix, ids } = run<{ matrix: number[][]; ids: string[] }>("floyd-warshall", input);
      ids.forEach((from, i) => {
        const expected = reference_shortest(input, from);
        ids.forEach((to, j) => expect(matrix[i][j]).toBe(expected[to]));
      });
    }
  });
});

describe("spanning trees", () => {
  test("Prim and Kruskal find the minimum weight", () => {
    for (const input of randoms({ directed: false, weighted: true, start: true })) {
      const expected = reference_mst(input);
      expect(run<{ weight: number }>("kruskal", { ...input, start: undefined }).weight).toBe(expected);
      const prim = run<{ weight: number; spanning: boolean }>("prim", input);
      if (prim.spanning) expect(prim.weight).toBe(expected);
    }
  });
});

describe("directed structure", () => {
  test("topological order puts every edge forward, or reports a cycle", () => {
    for (const input of randoms({ directed: true, weighted: false })) {
      const { order } = run<{ order: string[] | null }>("topological-sort", input);
      if (order) {
        expect(order).toHaveLength(input.nodes.length);
        for (const edge of input.edges) expect(order.indexOf(edge.from)).toBeLessThan(order.indexOf(edge.to));
      } else {
        const reach = (from: string, target: string, seen = new Set<string>()): boolean =>
          input.edges.some((edge) => edge.from === from && (edge.to === target || (!seen.has(edge.to) && (seen.add(edge.to), reach(edge.to, target, seen)))));
        expect(input.nodes.some((node) => reach(node.id, node.id))).toBe(true);
      }
    }
  });

  test("Tarjan's components are exactly the mutual-reachability classes", () => {
    for (const input of randoms({ directed: true, weighted: false })) {
      const { components } = run<{ components: string[][] }>("tarjan-scc", input);
      const reaches = (from: string, target: string) => {
        const seen = new Set([from]);
        const stack = [from];
        while (stack.length) {
          const at = stack.pop()!;
          if (at === target) return true;
          for (const edge of input.edges) if (edge.from === at && !seen.has(edge.to)) seen.add(edge.to), stack.push(edge.to);
        }
        return false;
      };
      const component_of = new Map(components.flatMap((list, i) => list.map((id) => [id, i] as const)));
      expect(component_of.size).toBe(input.nodes.length);
      for (const a of input.nodes) for (const b of input.nodes) expect(component_of.get(a.id) === component_of.get(b.id)).toBe(reaches(a.id, b.id) && reaches(b.id, a.id));
    }
  });
});

describe("max flow", () => {
  test("the classic sample carries 19", () => {
    expect(run<{ flow: number }>("max-flow", (graphs["max-flow"] as Definition<GraphInput>).input.sample).flow).toBe(19);
  });

  test("flows respect capacity and conservation, and equal a brute-force min cut", () => {
    for (const input of randoms({ directed: true, weighted: true, start: true, goal: true }, 20)) {
      const graph = { ...input, edges: input.edges.map((edge) => ({ ...edge, w: Math.abs(edge.w) || 1 })) };
      const { flow, edges } = run<{ flow: number; edges: number[] }>("max-flow", graph);
      graph.edges.forEach((edge, i) => {
        expect(edges[i]).toBeGreaterThanOrEqual(0);
        expect(edges[i]).toBeLessThanOrEqual(edge.w);
      });
      for (const node of graph.nodes) {
        if (node.id === graph.start || node.id === graph.goal) continue;
        const inflow = graph.edges.reduce((sum, edge, i) => sum + (edge.to === node.id ? edges[i] : 0), 0);
        const outflow = graph.edges.reduce((sum, edge, i) => sum + (edge.from === node.id ? edges[i] : 0), 0);
        expect(inflow).toBe(outflow);
      }
      const others = graph.nodes.map((node) => node.id).filter((id) => id !== graph.start && id !== graph.goal);
      let best = Infinity;
      for (let mask = 0; mask < 1 << others.length; mask++) {
        const side = new Set([graph.start!, ...others.filter((_, i) => mask & (1 << i))]);
        best = Math.min(best, graph.edges.reduce((sum, edge) => sum + (side.has(edge.from) && !side.has(edge.to) ? edge.w : 0), 0));
      }
      expect(flow).toBe(best);
    }
  });
});

describe("samples", () => {
  for (const [id, definition] of Object.entries(graphs)) {
    test(`${id}: sample, presets and random graphs run and format`, () => {
      for (const input of [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input as GraphInput);
      }
    });
  }
});
