export interface ServiceInfo {
  key: string;
  name: string;
  dependencies: readonly string[];
}

export interface GraphNode extends ServiceInfo {
  order: number;
  layer: number;
  row: number;
  dependents: string[];
}

export interface ServiceGraph {
  nodes: GraphNode[];
  layers: number;
  rows: number;
  edges: { from: string; to: string }[];
}

/** Services in init order, laid out in layers: a service sits one layer right of its deepest dependency. */
export function service_graph(services: readonly ServiceInfo[]): ServiceGraph {
  const known = new Set(services.map((service) => service.key));
  const layer = new Map<string, number>();
  for (const service of services) {
    const depths = service.dependencies.filter((key) => known.has(key)).map((key) => (layer.get(key) ?? 0) + 1);
    layer.set(service.key, Math.max(0, ...depths));
  }
  const rows = new Map<number, number>();
  const nodes: GraphNode[] = services.map((service, index) => {
    const at = layer.get(service.key)!;
    const row = rows.get(at) ?? 0;
    rows.set(at, row + 1);
    return {
      ...service,
      order: index + 1,
      layer: at,
      row,
      dependents: services.filter((other) => other.dependencies.includes(service.key)).map((other) => other.key),
    };
  });
  const edges = nodes.flatMap((node) => node.dependencies.filter((key) => known.has(key)).map((key) => ({ from: key, to: node.key })));
  return { nodes, layers: Math.max(0, ...layer.values()) + 1, rows: Math.max(0, ...rows.values()), edges };
}

/** `windows` → `WindowsService`: the class a key gets when nothing swaps it. */
export function default_class(key: string): string {
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}Service`;
}

export function is_swapped(service: ServiceInfo): boolean {
  return service.name !== default_class(service.key);
}
