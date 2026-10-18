import { define } from "../../engine/definition";
import { graph, sample_graph, type GraphInput, type GraphRules } from "../../engine/graph-input";
import { grid, Tone, type View } from "../../engine/step";
import { Graph, MinQueue } from "./common";
import { POSITIONS } from "./paths";

const WEIGHTED: GraphRules = { directed: false, weighted: true, start: true };
const UNDIRECTED: GraphRules = { directed: false, weighted: true };
const DAG: GraphRules = { directed: true, weighted: false };
const FLOW: GraphRules = { directed: true, weighted: true, start: true, goal: true, names: { start: "source", goal: "sink" } };

const ROAD = "A-B 4, A-C 2, B-D 5, C-D 8, C-E 10, D-E 2, D-F 6, E-G 3, F-G 1, B-F 12";

const prim = define({
  intro:
    "Prim's algorithm grows one tree from a start node. At each step it adds the cheapest edge that connects the tree to a node outside it. The cut property guarantees that edge belongs to some minimum spanning tree, so the result connects every node for the least total weight.",
  use: "Cheapest network that connects everything: cabling, pipes, road grids; dense graphs in particular.",
  traits: ["Greedy", "Minimum spanning tree", "Priority queue"],
  pseudocode: [
    "tree ← {start}; queue ← start's edges, cheapest first",
    "while the queue isn't empty:",
    "  take the cheapest edge (u, v)",
    "  if v is already in the tree: skip it",
    "  add v and the edge to the tree; queue v's edges",
  ],
  input: graph(WEIGHTED, sample_graph(WEIGHTED, `${ROAD}; start A`, POSITIONS)),
  *run(input: GraphInput) {
    const g = new Graph(input, true);
    const tree = new Set<string>([input.start!]);
    const queue = new MinQueue<{ from: string; to: string; edge: number }>();
    let total = 0;
    const counters = () => ({ "tree nodes": tree.size, weight: total });
    const pq = (): View => ({ kind: "chain", title: "candidate edges (cheapest first)", items: queue.list().map(({ item, priority }) => ({ text: `${item.from}${item.to} ${priority}`, tone: tree.has(item.to) ? Tone.MUTED : undefined })) });
    const offer = (u: string) => {
      for (const arc of g.neighbours(u)) if (!tree.has(arc.to)) queue.push({ from: u, to: arc.to, edge: arc.edge }, arc.w);
    };
    g.node_tones.set(input.start!, Tone.DONE);
    offer(input.start!);
    yield g.frame(`Start the tree at ${input.start}; its edges are the candidates.`, 0, counters(), [pq()]);
    while (queue.size) {
      const { item, priority } = queue.pop()!;
      if (tree.has(item.to)) {
        yield g.frame(`${item.from}–${item.to} (${priority}): ${item.to} is already in the tree, it would make a cycle.`, 3, counters(), [pq()], { edges: [[item.edge, Tone.MUTED]] });
        continue;
      }
      tree.add(item.to);
      total += priority;
      g.node_tones.set(item.to, Tone.DONE);
      g.edge_tones.set(item.edge, Tone.DONE);
      offer(item.to);
      yield g.frame(`Cheapest way out of the tree: ${item.from}–${item.to} for ${priority}. Add ${item.to}.`, 4, counters(), [pq()], { nodes: [[item.to, Tone.ACTIVE]], edges: [[item.edge, Tone.ACTIVE]] });
    }
    const spanning = tree.size === g.ids.length;
    yield g.frame(spanning ? `Done: a spanning tree of weight ${total}.` : `Done, but only ${tree.size} of ${g.ids.length} nodes are reachable: the graph isn't connected.`, -1, counters());
    return { weight: total, spanning };
  },
});

const kruskal = define({
  intro:
    "Kruskal's algorithm sorts every edge by weight and walks the list, keeping an edge whenever it joins two pieces that aren't connected yet. A union-find structure answers 'already connected?' almost instantly. The kept edges form a minimum spanning forest.",
  use: "Minimum spanning trees on sparse graphs, and clustering (stop early and the pieces left are the clusters).",
  traits: ["Greedy", "Minimum spanning tree", "Union-find"],
  pseudocode: [
    "sort the edges by weight",
    "every node starts in its own piece",
    "for each edge (u, v), cheapest first:",
    "  if u and v are in different pieces: keep the edge, join the pieces",
    "  otherwise: skip it (it would close a cycle)",
  ],
  input: graph(UNDIRECTED, sample_graph(UNDIRECTED, ROAD, POSITIONS)),
  *run(input: GraphInput) {
    const g = new Graph(input, true);
    const parent = new Map(g.ids.map((id) => [id, id]));
    const find = (x: string): string => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!);
        x = parent.get(x)!;
      }
      return x;
    };
    const order = input.edges.map((edge, index) => ({ ...edge, index })).sort((a, b) => a.w - b.w || a.index - b.index);
    const fate = new Map<number, Tone>();
    let total = 0;
    let kept = 0;
    const list = (active?: number): View =>
      grid({ title: "edges by weight", rows: [order.map((edge) => ({ text: `${edge.from}${edge.to} ${edge.w}`, tone: edge.index === active ? Tone.ACTIVE : fate.get(edge.index) }))] });
    const counters = () => ({ kept, weight: total });
    yield g.frame(`Sort the ${order.length} edges by weight. Every node is its own piece.`, 0, counters(), [list()]);
    for (const edge of order) {
      const [a, b] = [find(edge.from), find(edge.to)];
      if (a === b) {
        fate.set(edge.index, Tone.MUTED);
        g.edge_tones.set(edge.index, Tone.MUTED);
        yield g.frame(`${edge.from}–${edge.to} (${edge.w}): both ends are already connected. Skip it.`, 4, counters(), [list(edge.index)], { edges: [[edge.index, Tone.BAD]] });
        continue;
      }
      parent.set(a, b);
      total += edge.w;
      kept++;
      fate.set(edge.index, Tone.DONE);
      g.edge_tones.set(edge.index, Tone.DONE);
      g.node_tones.set(edge.from, Tone.DONE);
      g.node_tones.set(edge.to, Tone.DONE);
      yield g.frame(`${edge.from}–${edge.to} (${edge.w}) joins two pieces: keep it.`, 3, counters(), [list(edge.index)], { edges: [[edge.index, Tone.ACTIVE]] });
      if (kept === g.ids.length - 1) {
        yield g.frame(`${kept} edges connect all ${g.ids.length} nodes: the rest can only make cycles.`, 2, counters(), [list()]);
        break;
      }
    }
    yield g.frame(`Done: total weight ${total}.`, -1, counters(), [list()]);
    return { weight: total, kept };
  },
});

const topo = define({
  intro:
    "A topological order lists the nodes of a directed graph so that every edge points forward. Kahn's algorithm keeps a count of incoming edges per node: any node with none can go next. Taking it out lowers its neighbours' counts. If nodes remain that never reach zero, the graph has a cycle and no order exists.",
  use: "Build systems and package managers (what to build first), course prerequisites, spreadsheet recalculation, task scheduling.",
  traits: ["Directed acyclic graphs", "Detects cycles"],
  pseudocode: [
    "count each node's incoming edges",
    "queue ← every node with count 0",
    "while the queue isn't empty:",
    "  u ← take one; append it to the order",
    "  for each edge u → v: lower v's count; if it hits 0, queue v",
    "nodes left over: there's a cycle",
  ],
  input: graph(DAG, sample_graph(DAG, "A->B, A->C, B->D, C->D, D->E, C->F, F->E, G->F", { A: [8, 40], B: [35, 15], C: [35, 60], D: [62, 35], E: [90, 55], F: [62, 82], G: [20, 90] })),
  presets: [{ label: "With a cycle", value: sample_graph(DAG, "A->B, B->C, C->D, D->B, A->E", { A: [10, 50], B: [40, 20], C: [75, 35], D: [60, 75], E: [20, 85] }) }],
  *run(input: GraphInput) {
    const g = new Graph(input, false);
    const count = new Map(g.ids.map((id) => [id, 0]));
    for (const edge of input.edges) count.set(edge.to, count.get(edge.to)! + 1);
    const refresh = () => g.ids.forEach((id) => g.badges.set(id, `in ${count.get(id)}`));
    const queue = g.ids.filter((id) => count.get(id) === 0);
    const order: string[] = [];
    const views = (): View[] => [
      { kind: "chain", title: "ready (no incoming edges)", items: queue.map((text) => ({ text })) },
      { kind: "chain", title: "order", items: order.map((text) => ({ text, tone: Tone.DONE })) },
    ];
    refresh();
    yield g.frame("Count the incoming edges of every node.", 0, { placed: 0 }, views());
    yield g.frame(`${queue.join(", ") || "No node"} ${queue.length === 1 ? "has" : "have"} no incoming edges: ready to go.`, 1, { placed: 0 }, views(), { nodes: queue.map((id) => [id, Tone.ACTIVE] as [string, Tone]) });
    while (queue.length) {
      const u = queue.shift()!;
      order.push(u);
      g.node_tones.set(u, Tone.DONE);
      yield g.frame(`Place ${u} next.`, 3, { placed: order.length }, views(), { nodes: [[u, Tone.ACTIVE]] });
      for (const arc of g.neighbours(u)) {
        count.set(arc.to, count.get(arc.to)! - 1);
        refresh();
        g.edge_tones.set(arc.edge, Tone.MUTED);
        if (count.get(arc.to) === 0) queue.push(arc.to);
        yield g.frame(count.get(arc.to) === 0 ? `${arc.to} has no incoming edges left: it's ready.` : `${arc.to} still waits on ${count.get(arc.to)} more.`, 4, { placed: order.length }, views(), {
          nodes: [[arc.to, count.get(arc.to) === 0 ? Tone.WARN : Tone.COMPARE]],
        });
      }
    }
    const stuck = g.ids.filter((id) => !order.includes(id));
    if (stuck.length) {
      yield g.frame(`${stuck.join(", ")} never got free: they sit on a cycle, so there's no topological order.`, 5, { placed: order.length }, views(), { nodes: stuck.map((id) => [id, Tone.BAD] as [string, Tone]) });
      return { order: null };
    }
    yield g.frame(`Done: ${order.join(" → ")}. Every edge points forward in this order.`, -1, { placed: order.length }, views());
    return { order };
  },
});

const tarjan = define({
  intro:
    "A strongly connected component is a group of nodes that can all reach each other. Tarjan's algorithm finds every one in a single depth-first search. Each node gets an index in visit order and a low-link: the smallest index it can reach back to. A node whose low-link equals its own index roots a component, which is everything above it on the stack.",
  use: "Finding cycles of mutual dependency (module imports, deadlocks), condensing a graph into a DAG, 2-SAT solvers.",
  traits: ["Depth-first", "One pass", "Directed graphs"],
  pseudocode: [
    "visit(u): index[u] ← low[u] ← counter++; push u on the stack",
    "  for each edge u → v:",
    "    v unvisited: visit(v); low[u] ← min(low[u], low[v])",
    "    v on the stack: low[u] ← min(low[u], index[v])",
    "  if low[u] = index[u]: pop the stack down to u, that's one component",
  ],
  input: graph(DAG, sample_graph(DAG, "A->B, B->C, C->A, B->D, D->E, E->F, F->D, G->F, G->H, H->G", { A: [10, 25], B: [35, 15], C: [22, 60], D: [60, 30], E: [88, 25], F: [75, 70], G: [50, 88], H: [20, 92] })),
  *run(input: GraphInput) {
    const g = new Graph(input, false);
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const on_stack = new Set<string>();
    const components: string[][] = [];
    const palette = [Tone.DONE, Tone.COMPARE, Tone.MARK, Tone.WARN];
    let counter = 0;
    const badge = (id: string) => g.badges.set(id, `${index.get(id)}/${low.get(id)}`);
    const views = (): View[] => [
      { kind: "chain", title: "stack", items: stack.map((text) => ({ text })) },
      { kind: "text", title: "components", lines: components.map((list, i) => ({ text: `{${list.join(", ")}}`, tone: palette[i % palette.length] })) },
    ];
    const counters = () => ({ visited: index.size, components: components.length });
    function* visit(u: string): Generator<ReturnType<Graph["frame"]>> {
      index.set(u, counter);
      low.set(u, counter);
      counter++;
      stack.push(u);
      on_stack.add(u);
      badge(u);
      g.node_tones.set(u, Tone.ACTIVE);
      yield g.frame(`Visit ${u}: index ${index.get(u)}, low-link ${low.get(u)}. Push it.`, 0, counters(), views());
      for (const arc of g.neighbours(u)) {
        if (!index.has(arc.to)) {
          yield g.frame(`${u} → ${arc.to}: ${arc.to} is unvisited, go there.`, 2, counters(), views(), { edges: [[arc.edge, Tone.ACTIVE]] });
          yield* visit(arc.to);
          low.set(u, Math.min(low.get(u)!, low.get(arc.to)!));
          badge(u);
          yield g.frame(`Back at ${u}: low-link ← min(…, ${low.get(arc.to)}) = ${low.get(u)}.`, 2, counters(), views(), { nodes: [[u, Tone.ACTIVE]] });
        } else if (on_stack.has(arc.to)) {
          low.set(u, Math.min(low.get(u)!, index.get(arc.to)!));
          badge(u);
          yield g.frame(`${u} → ${arc.to}: ${arc.to} is on the stack, so ${u} reaches back to index ${index.get(arc.to)}. Low-link ${low.get(u)}.`, 3, counters(), views(), {
            nodes: [[u, Tone.ACTIVE], [arc.to, Tone.COMPARE]],
            edges: [[arc.edge, Tone.COMPARE]],
          });
        }
      }
      if (low.get(u) === index.get(u)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          on_stack.delete(w);
          component.push(w);
        } while (w !== u);
        components.push(component.reverse());
        const tone = palette[(components.length - 1) % palette.length];
        for (const id of component) g.node_tones.set(id, tone);
        yield g.frame(`${u}'s low-link equals its index: pop {${component.join(", ")}} as one component.`, 4, counters(), views());
      } else g.node_tones.set(u, Tone.MARK);
    }
    for (const id of g.ids) if (!index.has(id)) yield* visit(id);
    yield g.frame(`Done: ${components.length} strongly connected components.`, -1, counters(), views());
    return { components };
  },
});

const max_flow = define({
  intro:
    "How much can flow from a source to a sink if every edge has a capacity? Edmonds-Karp keeps finding a path that still has room, using breadth-first search on the residual graph (spare capacity forward, already-sent flow backward), and pushes as much as the path's tightest edge allows. When no path is left, the flow is maximal, and it equals the capacity of the smallest cut.",
  use: "Network bandwidth, traffic and pipe capacity, matching (jobs to workers), image segmentation by min-cut.",
  traits: ["Augmenting paths", "Max-flow = min-cut"],
  pseudocode: [
    "flow ← 0 on every edge",
    "while BFS finds a path from source to sink with spare capacity:",
    "  bottleneck ← the smallest spare capacity along it",
    "  push bottleneck along the path (and allow undoing it backwards)",
    "no path left: the flow is maximal",
  ],
  input: graph(
    FLOW,
    sample_graph(FLOW, "S->A 10, S->C 10, A->B 4, A->C 2, A->D 8, C->D 9, B->T 10, D->B 6, D->T 10; source S; sink T", { S: [5, 50], A: [35, 18], C: [35, 82], B: [70, 18], D: [70, 82], T: [95, 50] })
  ),
  *run(input: GraphInput) {
    const g = new Graph(input, false);
    const n_edges = input.edges.length;
    const flow = new Array(n_edges).fill(0);
    const source = input.start!;
    const sink = input.goal!;
    let total = 0;
    let paths = 0;
    const label = () => input.edges.forEach((edge, i) => g.edge_labels.set(i, `${flow[i]}/${edge.w}`));
    const residual = (id: string) => {
      const out: { to: string; edge: number; room: number; forward: boolean }[] = [];
      input.edges.forEach((edge, i) => {
        if (edge.from === id && flow[i] < edge.w) out.push({ to: edge.to, edge: i, room: edge.w - flow[i], forward: true });
        if (edge.to === id && flow[i] > 0) out.push({ to: edge.from, edge: i, room: flow[i], forward: false });
      });
      return out;
    };
    label();
    g.node_tones.set(source, Tone.MARK);
    g.node_tones.set(sink, Tone.MARK);
    yield g.frame(`Edges show flow/capacity. Push as much as possible from ${source} to ${sink}.`, 0, { flow: total, paths });
    for (;;) {
      const previous = new Map<string, { from: string; edge: number; forward: boolean; room: number }>();
      const queue = [source];
      const seen = new Set([source]);
      while (queue.length && !seen.has(sink)) {
        const u = queue.shift()!;
        for (const step of residual(u)) {
          if (seen.has(step.to)) continue;
          seen.add(step.to);
          previous.set(step.to, { from: u, edge: step.edge, forward: step.forward, room: step.room });
          queue.push(step.to);
        }
      }
      if (!seen.has(sink)) {
        const cut = [...seen];
        yield g.frame(
          `No path with spare room is left: the flow of ${total} is maximal. The nodes still reachable (${cut.join(", ")}) and the rest form a minimum cut of capacity ${total}.`,
          4,
          { flow: total, paths },
          [],
          { nodes: cut.map((id) => [id, Tone.MARK] as [string, Tone]) }
        );
        return { flow: total, edges: [...flow] };
      }
      const path: { from: string; to: string; edge: number; forward: boolean; room: number }[] = [];
      for (let at = sink; at !== source; ) {
        const step = previous.get(at)!;
        path.unshift({ from: step.from, to: at, edge: step.edge, forward: step.forward, room: step.room });
        at = step.from;
      }
      const bottleneck = Math.min(...path.map((step) => step.room));
      const names = [source, ...path.map((step) => step.to)];
      yield g.frame(
        `Breadth-first search finds ${names.join(" → ")}${path.some((step) => !step.forward) ? " (it undoes some flow on a backward edge)" : ""}. Its tightest spot leaves room for ${bottleneck}.`,
        2,
        { flow: total, paths },
        [],
        { nodes: names.map((id) => [id, Tone.ACTIVE] as [string, Tone]), edges: path.map((step) => [step.edge, step.room === bottleneck ? Tone.BAD : Tone.ACTIVE] as [number, Tone]) }
      );
      for (const step of path) flow[step.edge] += step.forward ? bottleneck : -bottleneck;
      total += bottleneck;
      paths++;
      label();
      input.edges.forEach((edge, i) => {
        if (flow[i] === 0) g.edge_tones.delete(i);
        else g.edge_tones.set(i, flow[i] === edge.w ? Tone.WARN : Tone.DONE);
      });
      yield g.frame(`Push ${bottleneck} along it. Total flow ${total}. Full edges are marked as changed.`, 3, { flow: total, paths });
    }
  },
});

export default { prim, kruskal, topo, tarjan, max_flow };
