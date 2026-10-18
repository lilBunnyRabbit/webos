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

- [x] Build (agent): 90 algorithms and structures in 12 groups, committed per group

## Owner addition (same day)

Owner: "for algorithms maybe lz77 aswell, and idk circular buffer, etc. as many such concepts as you can think". More groups in the same side nav, same engine and player, committed per group after sorting, trees and graphs:

- Data structures: stack, queue, deque, ring buffer, singly / doubly linked list, hash table (chaining; linear, quadratic, double hashing), bloom filter, LRU cache, skip list, consistent hashing ring.
- Compression & encoding: RLE, LZ77, LZ78 / LZW, Huffman, BWT + move-to-front, Base64.
- Strings: naive search, KMP, Boyer–Moore, Rabin–Karp, Z-algorithm, edit distance, suffix array.
- Searching: linear, binary, interpolation, exponential search, two pointers, sliding window.
- Dynamic programming: LCS, 0/1 knapsack, coin change, LIS, matrix-chain.
- Backtracking & puzzles: N-queens, sudoku, maze generation (DFS, Prim, Kruskal) and solving, flood fill.
- Math: Euclid, sieve of Eratosthenes, fast exponentiation, Fisher–Yates, reservoir sampling, CRC32.
- Geometry: convex hull (Graham, Jarvis), closest pair, line-sweep intersections.
- OS concepts: CPU scheduling (FCFS, SJF, round robin, priority), page replacement (FIFO, LRU, clock, optimal), producer–consumer.

If the total gets too large, what's left becomes a roadmap follow-up rather than cutting quality.

LZ77 ports the owner's own gist (`9a8f338a2ce2bf86fa463d5af13a27b6`): (distance, length, next char) triples, search and look-ahead buffers (default 255 / 255), overlapping matches, decode, and the binary view (2-bit bytes-per-value header, then fixed-width fields). Its one bug gets a test: a match that runs to the end of the look-ahead without a mismatch was never recorded, so "aaaa" encoded worse than it should.

## Owner framing (same day)

"Think of the algorithms app as a learning platform for CS students, really showing the algorithms, providing playground and explaining what happens. Do a good visual polish."

- Learn: per algorithm a short idea, when to use it, best / average / worst time and space, traits (stable, in place), real pseudocode with the running line lit.
- Explain: every step carries a plain-language note; live counters (comparisons, writes, visits, relaxations).
- Playground: type, randomise, presets including best and worst cases, draw graphs and points; parameters (pivot rule, gap sequence, buckets, window sizes, table size, quantum); interactive operations on structures that animate only what they added.
- One visual language across groups. One legend: Current (info, moved off primary because primary and success are both green in Brand Dark), Compared (secondary), Changed (warning), In play (tertiary), Final (success), Rejected (error), Out of play (muted), Wall (foreground). CSS transitions, so Motion off cuts them.
- Quality over breadth.

## Built (implementation notes)

- Side nav lists the groups; each group's algorithms are a tab row in the toolbar. One lazy module per group, not per algorithm.
- Parameters ride along in links and `.algo` files as an optional `params` object next to `input`; values outside an algorithm's ranges or choices are dropped.
- The app's toolbar has its own link button that copies a solo link with the current input and parameters (the titlebar Copy link carries launch props only).
- Huffman lives under Trees only; compression links to it in spirit rather than duplicating it. (Superseded by the follow-ups: Compression now has Huffman coding with bit output, reusing the Trees tree build.)
- Group names that wrapped in the side nav were shortened (Dyn. programming, Backtracking).

## Follow-ups

Built from the roadmap's follow-up list, inside the existing engine and patterns (no new state, services or dependencies):

- **Red-black delete:** successor copy, then the double-black fixup (red sibling; black sibling with black children; near child red; far child red), each case a pseudocode line and a note. A doubly black nil is narrated as "the empty left of 40".
- **B-tree delete:** top-down (CLRS): before entering a child with t − 1 keys, borrow through the parent or merge; inner keys swap with predecessor or successor; the root drops a level when it empties. Borrow and merge counters show on the B-tree only.
- **Boyer–Moore:** strong good-suffix table next to the bad-character table; slide by the larger, and the note says which wins; a full match slides by the period. A Rules parameter (both, bad only, good only) to compare comparisons.
- **Bentley–Ottmann:** a separate algorithm beside the simple line sweep, which stays as the stepping stone. Event points ordered by x then y; at each point the starting, ending and passing segments are grouped (de Berg), reported, removed and reinserted in their order just right of the point; only new neighbours are tested and crossings ahead are queued. Handles shared endpoints, vertical segments and many segments through one point; tested against all pairs on a coarse grid.
- **Huffman coding (Compression):** builds the tree with the Trees module's exported `huffman_tree`, `huffman_code_map` and `huffman_snapshot`, then encodes symbol by symbol into a bit stream and bytes, pads, and decodes by walking the tree.
- **Arithmetic coding:** exact BigInt fractions (input up to 32 characters), the shortest binary fraction inside the final interval as output; decoding narrows the same way. Counters compare against the information content and Huffman. Real coders' integer renormalisation is described, not shown.
- **Editor keyboard path:** nodes and points are focusable buttons in Tab order; arrows nudge (Shift for 10) and commit on key release, like a drag commits on release; Enter or Space picks and connects; Escape clears; Delete removes and moves focus to the next. Add node / Add point buttons give a keyboard and touch way to add. The stage SVG takes `role="group"` in the editors.
