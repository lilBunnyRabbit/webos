export interface Node {
  name: string;
  reads: Set<string>;
  /** Vars read through @prev: they must be set after, or the read sees this tick's value. */
  prev_reads: Set<string>;
}

export interface Ordered {
  order: string[];
  cycle: string[];
}

export function order_vars(nodes: Node[]): Ordered {
  const names = nodes.map((node) => node.name);
  const known = new Set(names);
  const after = new Map<string, Set<string>>(names.map((name) => [name, new Set()]));
  for (const node of nodes) {
    for (const dependency of node.reads) if (known.has(dependency) && dependency !== node.name) after.get(dependency)!.add(node.name);
    for (const target of node.prev_reads) if (known.has(target) && target !== node.name) after.get(node.name)!.add(target);
  }
  const incoming = new Map(names.map((name) => [name, 0]));
  for (const targets of after.values()) for (const target of targets) incoming.set(target, incoming.get(target)! + 1);

  const position = new Map(names.map((name, index) => [name, index]));
  const ready = names.filter((name) => incoming.get(name) === 0);
  const order: string[] = [];
  while (ready.length) {
    ready.sort((a, b) => position.get(a)! - position.get(b)!);
    const name = ready.shift()!;
    order.push(name);
    for (const target of after.get(name)!) {
      incoming.set(target, incoming.get(target)! - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }

  const left = names.filter((name) => !order.includes(name));
  return { order, cycle: left.length ? find_cycle(left, after) : [] };
}

function find_cycle(left: string[], after: Map<string, Set<string>>): string[] {
  const remaining = new Set(left);
  const before = (name: string) => left.find((other) => after.get(other)!.has(name) && remaining.has(other))!;
  const path: string[] = [];
  let current = left[0];
  while (!path.includes(current)) {
    path.push(current);
    current = before(current);
  }
  return [...path.slice(path.indexOf(current)), current].reverse();
}
