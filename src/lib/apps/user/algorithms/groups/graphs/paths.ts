import { define } from "../../engine/definition";
import { graph, sample_graph, type GraphInput, type GraphRules } from "../../engine/graph-input";
import { grid, Tone, type View } from "../../engine/step";
import { dist_text, Graph, MinQueue } from "./common";

export const POSITIONS: Record<string, [number, number]> = {
  A: [8, 50],
  B: [30, 18],
  C: [30, 82],
  D: [55, 40],
  E: [55, 78],
  F: [80, 18],
  G: [92, 62],
};

const UNWEIGHTED: GraphRules = { directed: false, weighted: false, start: true };
const WEIGHTED: GraphRules = { directed: false, weighted: true, start: true };
const STAR: GraphRules = { directed: false, weighted: true, start: true, goal: true };
const NEGATIVE: GraphRules = { directed: true, weighted: true, negative: true, start: true };
const MATRIX: GraphRules = { directed: true, weighted: true, negative: true };

const ROAD = "A-B 4, A-C 2, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-G 3, F-G 1, B-F 12";

const chain_view = (title: string, items: string[], active?: number): View => ({ kind: "chain", title, items: items.map((text, i) => ({ text, tone: i === active ? Tone.ACTIVE : undefined })) });

function path_to(previous: Map<string, string | null>, target: string): string[] {
  const path: string[] = [];
  for (let at: string | null | undefined = target; at; at = previous.get(at)) path.unshift(at);
  return path;
}

const bfs = define({
  intro:
    "Breadth-first search explores in rings: first every neighbour of the start, then all of their unvisited neighbours, and so on, using a queue. The order it reaches nodes is by number of edges from the start, so it finds shortest paths when every edge costs the same.",
  use: "Fewest hops: shortest paths in unweighted graphs, social-network degrees, puzzle states, web crawling level by level.",
  traits: ["Queue", "Shortest hops"],
  pseudocode: [
    "mark start, put it in the queue; dist[start] ← 0",
    "while the queue isn't empty:",
    "  u ← take the front of the queue",
    "  for each neighbour v of u:",
    "    if v isn't marked: mark it, dist[v] ← dist[u] + 1, add v to the back",
  ],
  input: graph(UNWEIGHTED, sample_graph(UNWEIGHTED, `${ROAD.replace(/ \d+/g, "")}; start A`, POSITIONS)),
  *run(input: GraphInput) {
    const g = new Graph(input, false);
    const start = input.start!;
    const dist = new Map<string, number>([[start, 0]]);
    const queue = [start];
    let visits = 0;
    g.node_tones.set(start, Tone.MARK);
    g.badges.set(start, "0");
    const counters = () => ({ visited: dist.size, "edges checked": visits });
    yield g.frame(`Start at ${start}, distance 0.`, 0, counters(), [chain_view("queue", queue)]);
    while (queue.length) {
      const u = queue.shift()!;
      g.node_tones.set(u, Tone.ACTIVE);
      yield g.frame(`Take ${u} from the front of the queue.`, 2, counters(), [chain_view("queue", queue)]);
      for (const arc of g.neighbours(u)) {
        visits++;
        if (dist.has(arc.to)) {
          yield g.frame(`${arc.to} is already marked.`, 3, counters(), [chain_view("queue", queue)], { edges: [[arc.edge, Tone.COMPARE]] });
          continue;
        }
        dist.set(arc.to, dist.get(u)! + 1);
        g.badges.set(arc.to, String(dist.get(arc.to)));
        g.node_tones.set(arc.to, Tone.MARK);
        g.edge_tones.set(arc.edge, Tone.DONE);
        queue.push(arc.to);
        yield g.frame(`${arc.to} is new: ${dist.get(arc.to)} ${dist.get(arc.to) === 1 ? "edge" : "edges"} from ${start}. Add it to the queue.`, 4, counters(), [chain_view("queue", queue, queue.length - 1)]);
      }
      g.node_tones.set(u, Tone.DONE);
    }
    yield g.frame(`Every node reachable from ${start} is visited. The green edges form a shortest-path tree.`, -1, counters());
    return { dist: Object.fromEntries(dist) };
  },
});

const dfs = define({
  intro:
    "Depth-first search follows one path as far as it can, then backs up to the last place with an unexplored edge, using a stack (here, recursion). Each node gets a discovery time and a finish time; those times are what topological sort, cycle detection and strongly connected components are built on.",
  use: "Exploring every possibility (mazes, puzzles), detecting cycles, topological order, connected components.",
  traits: ["Stack", "Discovery and finish times"],
  pseudocode: [
    "visit(u): mark u, record its discovery time",
    "  for each neighbour v of u:",
    "    if v isn't marked: visit(v)",
    "  record u's finish time (back up)",
  ],
  input: graph(UNWEIGHTED, sample_graph(UNWEIGHTED, `${ROAD.replace(/ \d+/g, "")}; start A`, POSITIONS)),
  *run(input: GraphInput) {
    const g = new Graph(input, false);
    const discovered = new Map<string, number>();
    const finished = new Map<string, number>();
    const stack: string[] = [];
    const order: string[] = [];
    let time = 0;
    const counters = () => ({ time, visited: discovered.size });
    const badge = (id: string) => g.badges.set(id, `${discovered.get(id) ?? ""}/${finished.get(id) ?? ""}`);
    function* visit(u: string, via: number | null): Generator<ReturnType<Graph["frame"]>> {
      discovered.set(u, ++time);
      order.push(u);
      stack.push(u);
      badge(u);
      g.node_tones.set(u, Tone.ACTIVE);
      if (via !== null) g.edge_tones.set(via, Tone.DONE);
      yield g.frame(`Discover ${u} at time ${time}.`, 0, counters(), [chain_view("stack", stack, stack.length - 1)]);
      for (const arc of g.neighbours(u)) {
        if (discovered.has(arc.to)) {
          yield g.frame(`${arc.to} is already marked: skip it.`, 2, counters(), [chain_view("stack", stack, stack.length - 1)], { edges: [[arc.edge, Tone.COMPARE]] });
          continue;
        }
        g.node_tones.set(u, Tone.MARK);
        yield g.frame(`${arc.to} is new: go deeper.`, 2, counters(), [chain_view("stack", stack, stack.length - 1)], { edges: [[arc.edge, Tone.ACTIVE]] });
        yield* visit(arc.to, arc.edge);
        g.node_tones.set(u, Tone.ACTIVE);
      }
      finished.set(u, ++time);
      badge(u);
      stack.pop();
      g.node_tones.set(u, Tone.DONE);
      yield g.frame(`${u} has no unexplored edges: finish it at time ${time} and back up.`, 3, counters(), [chain_view("stack", stack, stack.length - 1)]);
    }
    yield* visit(input.start!, null);
    yield g.frame(`Done. Badges read discovery/finish. Visit order: ${order.join(" → ")}.`, -1, counters());
    return { order, discovered: Object.fromEntries(discovered), finished: Object.fromEntries(finished) };
  },
});

const dijkstra = define({
  intro:
    "Dijkstra's algorithm grows a set of nodes whose shortest distance is final. It always settles the closest unsettled node next, then relaxes its edges: if going through it is shorter, a neighbour's tentative distance drops. It needs every weight to be non-negative.",
  use: "Shortest routes on road maps, network routing (OSPF), any weighted graph without negative edges.",
  traits: ["Greedy", "Priority queue", "Non-negative weights"],
  pseudocode: [
    "dist[start] ← 0, every other dist ← ∞; queue ← {start}",
    "while the queue isn't empty:",
    "  u ← the node in the queue with the smallest dist",
    "  if u is already settled: skip it; otherwise settle u",
    "  for each edge u → v with weight w:",
    "    if dist[u] + w < dist[v]: dist[v] ← dist[u] + w, previous[v] ← u, add v",
  ],
  input: graph(WEIGHTED, sample_graph(WEIGHTED, `${ROAD}; start A`, POSITIONS)),
  *run(input: GraphInput) {
    const g = new Graph(input, true);
    const dist = new Map(g.ids.map((id) => [id, Infinity]));
    const previous = new Map<string, string | null>(g.ids.map((id) => [id, null]));
    const via = new Map<string, number>();
    const settled = new Set<string>();
    const queue = new MinQueue<string>();
    let relaxations = 0;
    const start = input.start!;
    dist.set(start, 0);
    queue.push(start, 0);
    const refresh = () => g.ids.forEach((id) => g.badges.set(id, dist_text(dist.get(id)!)));
    const pq = (): View => ({ kind: "chain", title: "queue (closest first)", items: queue.list().map(({ item, priority }) => ({ text: `${item} ${priority}` })) });
    const counters = () => ({ settled: settled.size, relaxations });
    refresh();
    yield g.frame(`Start at ${start} with distance 0; every other node starts at ∞.`, 0, counters(), [pq()], { nodes: [[start, Tone.ACTIVE]] });
    while (queue.size) {
      const { item: u, priority } = queue.pop()!;
      if (settled.has(u)) {
        yield g.frame(`${u} ${priority} is an old entry: ${u} is already settled.`, 3, counters(), [pq()]);
        continue;
      }
      settled.add(u);
      g.node_tones.set(u, Tone.DONE);
      if (via.has(u)) g.edge_tones.set(via.get(u)!, Tone.DONE);
      yield g.frame(`Settle ${u}: no shorter way to it exists. Distance ${dist.get(u)}.`, 2, counters(), [pq()], { nodes: [[u, Tone.ACTIVE]] });
      for (const arc of g.neighbours(u)) {
        if (settled.has(arc.to)) continue;
        relaxations++;
        const candidate = dist.get(u)! + arc.w;
        const better = candidate < dist.get(arc.to)!;
        const before = dist.get(arc.to)!;
        if (better) {
          dist.set(arc.to, candidate);
          previous.set(arc.to, u);
          via.set(arc.to, arc.edge);
          queue.push(arc.to, candidate);
          refresh();
        }
        yield g.frame(
          better
            ? `Through ${u}, ${arc.to} costs ${dist.get(u)} + ${arc.w} = ${candidate}, better than ${dist_text(before)}.`
            : `Through ${u}, ${arc.to} would cost ${candidate}: not better than ${dist_text(before)}.`,
          5,
          counters(),
          [pq()],
          { nodes: [[u, Tone.ACTIVE], [arc.to, better ? Tone.WARN : Tone.COMPARE]], edges: [[arc.edge, better ? Tone.WARN : Tone.COMPARE]] }
        );
      }
    }
    yield g.frame("Every reachable node is settled. The green edges are the shortest-path tree.", -1, counters());
    return { dist: Object.fromEntries(dist), previous: Object.fromEntries(previous) };
  },
});

const a_star = define({
  intro:
    "A* is Dijkstra with a sense of direction. It orders nodes by f = g + h, where g is the cost so far and h is an estimate of the cost still to go (here, the straight-line distance, scaled so it never overestimates). It still finds the shortest path, but usually opens far fewer nodes.",
  use: "Path-finding in games and maps, where you know where the goal is.",
  traits: ["Best-first", "Admissible heuristic"],
  pseudocode: [
    "g[start] ← 0; open ← {start} by f = g + h",
    "while open isn't empty:",
    "  u ← the node in open with the smallest f",
    "  if u is the goal: rebuild the path and stop",
    "  close u",
    "  for each edge u → v with weight w:",
    "    if g[u] + w < g[v]: g[v] ← g[u] + w, previous[v] ← u, put v in open with f = g[v] + h(v)",
  ],
  input: graph(STAR, sample_graph(STAR, `${ROAD}; start A; goal G`, POSITIONS)),
  *run(input: GraphInput) {
    const g = new Graph(input, true);
    const position = new Map(input.nodes.map((node) => [node.id, node]));
    const straight = (a: string, b: string) => Math.hypot(position.get(a)!.x - position.get(b)!.x, position.get(a)!.y - position.get(b)!.y);
    const scale = Math.min(1, ...input.edges.map((edge) => edge.w / Math.max(1e-9, straight(edge.from, edge.to))).filter((ratio) => ratio > 0));
    const goal = input.goal!;
    const h = (id: string) => Math.floor(straight(id, goal) * scale * 10) / 10;
    const cost = new Map(g.ids.map((id) => [id, Infinity]));
    const previous = new Map<string, string | null>(g.ids.map((id) => [id, null]));
    const via = new Map<string, number>();
    const closed = new Set<string>();
    const open = new MinQueue<string>();
    let expanded = 0;
    const start = input.start!;
    cost.set(start, 0);
    open.push(start, h(start));
    const refresh = () => g.ids.forEach((id) => g.badges.set(id, cost.get(id) === Infinity ? `h ${h(id)}` : `${cost.get(id)}+${h(id)}`));
    const pq = (): View => ({ kind: "chain", title: "open (smallest f first)", items: open.list().map(({ item, priority }) => ({ text: `${item} f=${Math.round(priority * 10) / 10}` })) });
    const counters = () => ({ expanded, open: open.size });
    refresh();
    g.node_tones.set(goal, Tone.MARK);
    yield g.frame(`Find a path from ${start} to ${goal}. Badges show g+h; h is the straight-line estimate.`, 0, counters(), [pq()]);
    while (open.size) {
      const { item: u } = open.pop()!;
      if (closed.has(u)) continue;
      expanded++;
      if (u === goal) {
        const path = path_to(previous, goal);
        for (const id of path) g.node_tones.set(id, Tone.DONE);
        for (const id of path.slice(1)) g.edge_tones.set(via.get(id)!, Tone.DONE);
        yield g.frame(`Reached ${goal}: ${path.join(" → ")}, cost ${cost.get(goal)}. Only ${expanded} nodes were opened.`, 3, counters(), [pq()]);
        return { cost: cost.get(goal)!, path, expanded };
      }
      closed.add(u);
      g.node_tones.set(u, Tone.MUTED);
      yield g.frame(`Open ${u}: f = ${cost.get(u)} + ${h(u)} is the smallest.`, 2, counters(), [pq()], { nodes: [[u, Tone.ACTIVE]] });
      for (const arc of g.neighbours(u)) {
        if (closed.has(arc.to)) continue;
        const candidate = cost.get(u)! + arc.w;
        const better = candidate < cost.get(arc.to)!;
        if (better) {
          cost.set(arc.to, candidate);
          previous.set(arc.to, u);
          via.set(arc.to, arc.edge);
          open.push(arc.to, candidate + h(arc.to));
          refresh();
        }
        yield g.frame(
          better ? `${arc.to}: g = ${candidate}, f = ${candidate} + ${h(arc.to)} = ${Math.round((candidate + h(arc.to)) * 10) / 10}.` : `${arc.to}: ${candidate} isn't better than ${cost.get(arc.to)}.`,
          6,
          counters(),
          [pq()],
          { nodes: [[u, Tone.ACTIVE], [arc.to, better ? Tone.WARN : Tone.COMPARE]], edges: [[arc.edge, better ? Tone.WARN : Tone.COMPARE]] }
        );
      }
    }
    yield g.frame(`${goal} can't be reached from ${start}.`, 1, counters());
    return { cost: Infinity, path: [], expanded };
  },
});

const bellman_ford = define({
  intro:
    "Bellman-Ford relaxes every edge, n − 1 times over. A shortest path has at most n − 1 edges, so after that many rounds every distance is final, even with negative weights. One more round that still improves something proves a negative cycle: a loop you could go round forever to make the path cheaper.",
  use: "Graphs with negative weights (currency arbitrage, some routing protocols like RIP), and detecting negative cycles.",
  traits: ["Negative weights", "Detects negative cycles"],
  pseudocode: [
    "dist[start] ← 0, every other dist ← ∞",
    "repeat n − 1 times:",
    "  for each edge u → v with weight w:",
    "    if dist[u] + w < dist[v]: dist[v] ← dist[u] + w",
    "one more pass: if any edge still improves, there's a negative cycle",
  ],
  input: graph(NEGATIVE, sample_graph(NEGATIVE, "A->B 6, A->C 7, B->D 5, B->C 8, B->E -4, C->D -3, C->E 9, D->B -2, E->D 7, E->A 2; start A", { A: [10, 50], B: [40, 18], C: [40, 82], D: [80, 18], E: [80, 82] })),
  presets: [
    {
      label: "Negative cycle",
      value: sample_graph(NEGATIVE, "A->B 1, B->C -2, C->D 2, D->B -1, A->D 5; start A", { A: [10, 50], B: [45, 18], C: [85, 50], D: [45, 82] }),
    },
  ],
  *run(input: GraphInput) {
    const g = new Graph(input, true);
    const dist = new Map(g.ids.map((id) => [id, Infinity]));
    const via = new Map<string, number>();
    let relaxations = 0;
    dist.set(input.start!, 0);
    const refresh = () => g.ids.forEach((id) => g.badges.set(id, dist_text(dist.get(id)!)));
    const table = (): View => grid({ title: "dist", col_labels: g.ids, rows: [g.ids.map((id) => ({ text: dist_text(dist.get(id)!) }))] });
    refresh();
    yield g.frame(`Start at ${input.start} with distance 0.`, 0, { round: 0, relaxations }, [table()]);
    for (let round = 1; round < g.ids.length; round++) {
      let changed = false;
      yield g.frame(`Round ${round} of ${g.ids.length - 1}: relax every edge.`, 1, { round, relaxations }, [table()]);
      for (const [index, edge] of input.edges.entries()) {
        if (dist.get(edge.from) === Infinity) continue;
        relaxations++;
        const candidate = dist.get(edge.from)! + edge.w;
        if (candidate < dist.get(edge.to)!) {
          const before = dist.get(edge.to)!;
          dist.set(edge.to, candidate);
          via.set(edge.to, index);
          changed = true;
          refresh();
          yield g.frame(`${edge.from} → ${edge.to}: ${dist.get(edge.from)} + ${edge.w} = ${candidate} beats ${dist_text(before)}.`, 3, { round, relaxations }, [table()], {
            nodes: [[edge.to, Tone.WARN]],
            edges: [[index, Tone.WARN]],
          });
        }
      }
      if (!changed) {
        yield g.frame(`Nothing changed in round ${round}: the distances are final already.`, 1, { round, relaxations }, [table()]);
        break;
      }
    }
    for (const [index, edge] of input.edges.entries()) {
      if (dist.get(edge.from) !== Infinity && dist.get(edge.from)! + edge.w < dist.get(edge.to)!) {
        yield g.frame(`${edge.from} → ${edge.to} still improves after ${g.ids.length - 1} rounds: there's a negative cycle, so shortest paths don't exist.`, 4, { relaxations }, [table()], {
          nodes: [[edge.from, Tone.BAD], [edge.to, Tone.BAD]],
          edges: [[index, Tone.BAD]],
        });
        return { dist: null, negative_cycle: true };
      }
    }
    for (const index of via.values()) g.edge_tones.set(index, Tone.DONE);
    yield g.frame("No edge improves any more: no negative cycle, and the distances are final.", 4, { relaxations }, [table()]);
    return { dist: Object.fromEntries(dist), negative_cycle: false };
  },
});

const floyd = define({
  intro:
    "Floyd-Warshall finds the shortest path between every pair of nodes at once. It fills a distance matrix and then, for each node k in turn, asks for every pair (i, j): is going through k shorter? After the last k, the matrix holds every shortest distance. Three nested loops, n³ steps.",
  use: "All-pairs distances on small dense graphs: routing tables, transitive closure, comparing every city with every other.",
  traits: ["Dynamic programming", "All pairs", "Negative weights"],
  pseudocode: [
    "d[i][j] ← the edge weight, 0 on the diagonal, ∞ otherwise",
    "for each k:",
    "  for each i, for each j:",
    "    if d[i][k] + d[k][j] < d[i][j]: d[i][j] ← d[i][k] + d[k][j]",
  ],
  input: graph(MATRIX, sample_graph(MATRIX, "A->B 3, A->D 7, B->A 8, B->C 2, C->A 5, C->D 1, D->A 2", { A: [15, 20], B: [85, 20], C: [85, 80], D: [15, 80] })),
  *run(input: GraphInput) {
    const g = new Graph(input, true);
    const ids = g.ids;
    const n = ids.length;
    const d = ids.map((_, i) => ids.map((_, j) => (i === j ? 0 : Infinity)));
    for (const edge of input.edges) d[ids.indexOf(edge.from)][ids.indexOf(edge.to)] = Math.min(d[ids.indexOf(edge.from)][ids.indexOf(edge.to)], edge.w);
    let updates = 0;
    const matrix = (tones: [number, number, Tone][] = [], k?: number): View =>
      grid({
        title: "distance matrix (row → column)",
        row_labels: ids,
        col_labels: ids,
        rows: d.map((row, i) => row.map((value, j) => ({ text: dist_text(value), tone: tones.find(([a, b]) => a === i && b === j)?.[2] ?? (k !== undefined && (i === k || j === k) ? Tone.MARK : undefined) }))),
      });
    yield g.frame("Start with the direct edges: 0 to itself, ∞ where there's no edge.", 0, { k: "–", updates }, [matrix()]);
    for (let k = 0; k < n; k++) {
      yield g.frame(`k = ${ids[k]}: can any path get shorter by going through ${ids[k]}?`, 1, { k: ids[k], updates }, [matrix([], k)], { nodes: [[ids[k], Tone.ACTIVE]] });
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === k || j === k || i === j || d[i][k] === Infinity || d[k][j] === Infinity) continue;
          const through = d[i][k] + d[k][j];
          if (through < d[i][j]) {
            const before = d[i][j];
            d[i][j] = through;
            updates++;
            yield g.frame(`${ids[i]} → ${ids[k]} → ${ids[j]} costs ${d[i][k]} + ${d[k][j]} = ${through}, better than ${dist_text(before)}.`, 3, { k: ids[k], updates }, [matrix([[i, k, Tone.COMPARE], [k, j, Tone.COMPARE], [i, j, Tone.WARN]], k)], {
              nodes: [[ids[k], Tone.ACTIVE], [ids[i], Tone.COMPARE], [ids[j], Tone.COMPARE]],
            });
          }
        }
      }
    }
    const negative = d.some((row, i) => row[i] < 0);
    yield g.frame(negative ? "A negative number on the diagonal: some node reaches itself for less than 0, so there's a negative cycle." : "Done: every shortest distance, all pairs.", -1, { k: "–", updates }, [matrix()]);
    return { matrix: d, ids, negative_cycle: negative };
  },
});

export default { bfs, dfs, dijkstra, a_star, bellman_ford, floyd };
