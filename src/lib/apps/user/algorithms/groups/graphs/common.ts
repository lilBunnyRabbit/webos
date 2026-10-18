import type { GraphInput } from "../../engine/graph-input";
import type { GraphView, Step, Tone, View } from "../../engine/step";

export interface Arc {
  to: string;
  w: number;
  edge: number;
}

export class Graph {
  readonly ids: string[];
  readonly adj = new Map<string, Arc[]>();
  readonly node_tones = new Map<string, Tone>();
  readonly edge_tones = new Map<number, Tone>();
  readonly badges = new Map<string, string>();
  readonly edge_labels = new Map<number, string>();

  constructor(
    readonly input: GraphInput,
    readonly weighted: boolean
  ) {
    this.ids = input.nodes.map((node) => node.id);
    for (const id of this.ids) this.adj.set(id, []);
    input.edges.forEach((edge, index) => {
      this.adj.get(edge.from)!.push({ to: edge.to, w: edge.w, edge: index });
      if (!input.directed) this.adj.get(edge.to)!.push({ to: edge.from, w: edge.w, edge: index });
    });
    for (const list of this.adj.values()) list.sort((a, b) => a.to.localeCompare(b.to));
  }

  neighbours(id: string): Arc[] {
    return this.adj.get(id) ?? [];
  }

  view(title?: string, marks: { nodes?: [string, Tone][]; edges?: [number, Tone][] } = {}): GraphView {
    const node_tones = new Map(this.node_tones);
    for (const [id, tone] of marks.nodes ?? []) node_tones.set(id, tone);
    const edge_tones = new Map(this.edge_tones);
    for (const [index, tone] of marks.edges ?? []) edge_tones.set(index, tone);
    return {
      kind: "graph",
      title,
      directed: this.input.directed,
      nodes: this.input.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, tone: node_tones.get(node.id), badge: this.badges.get(node.id) })),
      edges: this.input.edges.map((edge, index) => ({
        from: edge.from,
        to: edge.to,
        tone: edge_tones.get(index),
        label: this.edge_labels.get(index) ?? (this.weighted ? String(edge.w) : undefined),
      })),
    };
  }

  frame(note: string, line: number, counters: Record<string, number | string>, extra: View[] = [], marks: { nodes?: [string, Tone][]; edges?: [number, Tone][] } = {}): Step {
    return { views: [this.view(undefined, marks), ...extra], line, note, counters };
  }
}

export const dist_text = (value: number) => (value === Infinity ? "∞" : value === -Infinity ? "−∞" : String(value));

export class MinQueue<T> {
  private items: { item: T; priority: number; order: number }[] = [];
  private count = 0;

  push(item: T, priority: number) {
    this.items.push({ item, priority, order: this.count++ });
  }

  pop(): { item: T; priority: number } | undefined {
    if (this.items.length === 0) return undefined;
    let best = 0;
    for (let i = 1; i < this.items.length; i++) {
      const [a, b] = [this.items[i], this.items[best]];
      if (a.priority < b.priority || (a.priority === b.priority && a.order < b.order)) best = i;
    }
    const [taken] = this.items.splice(best, 1);
    return taken;
  }

  get size() {
    return this.items.length;
  }

  list(): { item: T; priority: number }[] {
    return [...this.items].sort((a, b) => a.priority - b.priority || a.order - b.order);
  }
}
