# Algorithm visualizers

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

Owner: "algorithm apps - sorting, trees (b/w, dijkstra, etc all the cs trees)". Roadmap item under P3 › Algorithms. Nothing exists; closest patterns are sectioned apps (Image Tools, GW2: lazy sections, `section` prop) and the games kit (pure `.ts` logic tested in Node, rendering in `.svelte`).

## Decisions

- **One app, three groups.** "Algorithms", side nav grouped Sorting / Trees / Graphs, each algorithm a lazy section; one shared player.
- **Engine: generators of snapshot steps.** Each algorithm is a pure generator yielding a full state snapshot, the highlighted pseudocode line and counters. The player collects the steps, so step back, scrub and jump are free. Input size is capped. Node-tested (sorted result, tree invariants, shortest paths).
- **Drawing: SVG**, theme tokens through CSS; tidy-tree layout, pan and pinch on phones. Sorting bars SVG up to ~200; a canvas renderer only for big sorting inputs.
- **Shell, links, files.** Props `{ section, input }` so Copy solo link shares one algorithm with its input. `algo list` (columns: id, group, time, space) and `algo <id> [input]`. Inputs typed, random, or (graphs) drawn by clicking. `.algo` files: versioned JSON `{ version: 1, algorithm, input }`, associated with the app, Save / Open in the toolbar.
- **Scope: the full list in v1**, committed per group: engine + player + sorting (10 + race), then trees (BST, AVL, red-black, B / B+, splay, treap, heap, trie, segment, Fenwick, interval, k-d, union-find, Huffman), then graphs (BFS / DFS, Dijkstra, A*, Bellman-Ford, Floyd-Warshall, Prim / Kruskal, topological sort, Tarjan, max flow).
- "b/w" read as B-trees and red-black trees.

## Action items

- [ ] Build (agent)
