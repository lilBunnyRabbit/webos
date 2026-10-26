import { service_graph, type ServiceInfo } from "./graph";

export interface MapNode {
  key: string;
  label: string;
  detail?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: string;
  hash?: string;
  tone?: "primary" | "secondary";
}

export interface MapCluster {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapLink {
  from: string;
  to: string;
  label?: string;
}

export interface WorldMap {
  nodes: MapNode[];
  clusters: MapCluster[];
  links: MapLink[];
  width: number;
  height: number;
}

export interface MapInput {
  services: readonly ServiceInfo[];
  shell: readonly [string, string][];
  design: readonly [string, string][];
  system_apps: readonly { id: string; name: string; slug: string }[];
  user_apps: number;
  stores: readonly { label: string; detail: string; hash: string }[];
  adrs: { total: number; latest: readonly { id: string; label: string }[] };
}

const NODE_W = 140;
const NODE_H = 40;
const GAP = 12;
const PAD = 28;
const CLUSTER_GAP = 120;

function cluster_of(key: string, label: string, nodes: MapNode[]): MapCluster {
  const x = Math.min(...nodes.map((node) => node.x)) - PAD;
  const y = Math.min(...nodes.map((node) => node.y)) - PAD - 14;
  const right = Math.max(...nodes.map((node) => node.x + node.w)) + PAD;
  const bottom = Math.max(...nodes.map((node) => node.y + node.h)) + PAD;
  return { key, label, x, y, w: right - x, h: bottom - y };
}

function column(prefix: string, items: readonly Omit<MapNode, "x" | "y" | "w" | "h">[], x: number, y: number, columns = 1): MapNode[] {
  return items.map((item, index) => ({
    ...item,
    key: `${prefix}:${item.key}`,
    x: x + (index % columns) * (NODE_W + GAP),
    y: y + Math.floor(index / columns) * (NODE_H + GAP),
    w: NODE_W,
    h: NODE_H,
  }));
}

export function world_map(input: MapInput): WorldMap {
  const graph = service_graph(input.services);
  const kernel: MapNode[] = graph.nodes.map((node) => ({
    key: `service:${node.key}`,
    label: node.key,
    detail: node.name,
    page: `system/services/${node.key}`,
    x: node.layer * (NODE_W + 48),
    y: node.row * (NODE_H + GAP),
    w: NODE_W,
    h: NODE_H,
  }));
  const kernel_cluster = cluster_of("kernel", "Kernel services", kernel);

  const shell = column(
    "shell",
    input.shell.map(([id, title]) => ({ key: id, label: title, page: id })),
    kernel_cluster.x - CLUSTER_GAP - NODE_W - PAD,
    0
  );

  const apps = column(
    "app",
    [
      ...input.system_apps.map((app) => ({ key: app.id, label: app.name, page: "system/system-apps", hash: app.slug })),
      { key: "user", label: `${input.user_apps} user apps`, detail: "App atlas", page: "apps/README", tone: "primary" as const },
    ],
    kernel_cluster.x + kernel_cluster.w + CLUSTER_GAP + PAD,
    0,
    2
  );

  const above = kernel_cluster.y - CLUSTER_GAP - NODE_H - PAD;
  const design = column(
    "design",
    input.design.map(([id, title]) => ({ key: id, label: title, page: id })),
    kernel_cluster.x + PAD,
    above,
    input.design.length
  );
  const design_right = Math.max(...design.map((node) => node.x + node.w), kernel_cluster.x + PAD);
  const decisions = column(
    "adr",
    [
      { key: "index", label: `${input.adrs.total} decisions`, detail: "Timeline", page: "adrs/README", tone: "primary" as const },
      ...input.adrs.latest.map((adr) => ({ key: adr.id, label: adr.label, page: adr.id })),
    ],
    design_right + CLUSTER_GAP,
    above,
    input.adrs.latest.length + 1
  );

  const storage = column(
    "store",
    input.stores.map((store) => ({ key: store.label, label: store.label, detail: store.detail, page: "system/persistence", hash: store.hash, tone: "secondary" as const })),
    kernel_cluster.x + PAD,
    kernel_cluster.y + kernel_cluster.h + CLUSTER_GAP + PAD + 14,
    Math.min(input.stores.length, 6)
  );

  const clusters = [kernel_cluster];
  const add = (key: string, label: string, nodes: MapNode[]) => nodes.length > 0 && clusters.push(cluster_of(key, label, nodes));
  add("shell", "Shell", shell);
  add("apps", "Apps", apps);
  add("design", "Design", design);
  add("decisions", "Decisions", decisions);
  add("storage", "Storage", storage);

  const has = (key: string) => graph.nodes.some((node) => node.key === key);
  const links: MapLink[] = graph.edges.map((edge) => ({ from: `service:${edge.from}`, to: `service:${edge.to}` }));
  if (has("windows")) links.push({ from: "cluster:shell", to: "service:windows", label: "windows" });
  if (has("apps")) links.push({ from: "service:apps", to: "cluster:apps", label: "launch" });
  if (has("files")) links.push({ from: "service:files", to: "cluster:storage", label: "OPFS" });
  links.push({ from: "cluster:design", to: "cluster:kernel", label: "tokens" });

  const nodes = [...kernel, ...shell, ...apps, ...design, ...decisions, ...storage];
  const min_x = Math.min(...clusters.map((cluster) => cluster.x));
  const min_y = Math.min(...clusters.map((cluster) => cluster.y));
  const shift = <T extends { x: number; y: number }>(item: T): T => ({ ...item, x: item.x - min_x + 40, y: item.y - min_y + 40 });
  const moved_clusters = clusters.map(shift);
  return {
    nodes: nodes.map(shift),
    clusters: moved_clusters,
    links,
    width: Math.max(...moved_clusters.map((cluster) => cluster.x + cluster.w)) + 40,
    height: Math.max(...moved_clusters.map((cluster) => cluster.y + cluster.h)) + 40,
  };
}
