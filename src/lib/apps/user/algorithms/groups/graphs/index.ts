import type { Definition } from "../../engine/definition";
import paths from "./paths";
import structure from "./structure";

export default {
  bfs: paths.bfs,
  dfs: paths.dfs,
  dijkstra: paths.dijkstra,
  "a-star": paths.a_star,
  "bellman-ford": paths.bellman_ford,
  "floyd-warshall": paths.floyd,
  prim: structure.prim,
  kruskal: structure.kruskal,
  "topological-sort": structure.topo,
  "tarjan-scc": structure.tarjan,
  "max-flow": structure.max_flow,
} as unknown as Record<string, Definition>;
