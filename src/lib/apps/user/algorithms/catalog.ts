export const Group = {
  SORTING: "sorting",
  TREES: "trees",
  GRAPHS: "graphs",
  STRUCTURES: "structures",
  COMPRESSION: "compression",
} as const;
export type Group = (typeof Group)[keyof typeof Group];

export const GROUP_NAMES: Record<Group, string> = {
  [Group.SORTING]: "Sorting",
  [Group.TREES]: "Trees",
  [Group.GRAPHS]: "Graphs",
  [Group.STRUCTURES]: "Data structures",
  [Group.COMPRESSION]: "Compression",
};

export interface Complexity {
  best: string;
  average: string;
  worst: string;
  space: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  group: Group;
  summary: string;
  complexity: Complexity;
}

const entry = (id: string, name: string, group: Group, summary: string, [best, average, worst, space]: [string, string, string, string]): CatalogEntry => ({
  id,
  name,
  group,
  summary,
  complexity: { best, average, worst, space },
});

export const CATALOG: CatalogEntry[] = [
  entry("bubble-sort", "Bubble sort", Group.SORTING, "Swap neighbours until nothing moves", ["O(n)", "O(n²)", "O(n²)", "O(1)"]),
  entry("selection-sort", "Selection sort", Group.SORTING, "Pick the smallest left and put it in front", ["O(n²)", "O(n²)", "O(n²)", "O(1)"]),
  entry("insertion-sort", "Insertion sort", Group.SORTING, "Slide each value back into the sorted part", ["O(n)", "O(n²)", "O(n²)", "O(1)"]),
  entry("shell-sort", "Shell sort", Group.SORTING, "Insertion sort over shrinking gaps", ["O(n log n)", "O(n^1.3)", "O(n²)", "O(1)"]),
  entry("merge-sort", "Merge sort", Group.SORTING, "Split in halves, sort each, merge them", ["O(n log n)", "O(n log n)", "O(n log n)", "O(n)"]),
  entry("quick-sort", "Quick sort", Group.SORTING, "Partition around a pivot, recurse on both sides", ["O(n log n)", "O(n log n)", "O(n²)", "O(log n)"]),
  entry("heap-sort", "Heap sort", Group.SORTING, "Build a max-heap, pull the largest out each time", ["O(n log n)", "O(n log n)", "O(n log n)", "O(1)"]),
  entry("counting-sort", "Counting sort", Group.SORTING, "Count each value, then write them back in order", ["O(n + k)", "O(n + k)", "O(n + k)", "O(k)"]),
  entry("radix-sort", "Radix sort", Group.SORTING, "Sort digit by digit, least significant first", ["O(d·n)", "O(d·n)", "O(d·n)", "O(n)"]),
  entry("bucket-sort", "Bucket sort", Group.SORTING, "Drop values into ranges, sort each range", ["O(n + k)", "O(n + k)", "O(n²)", "O(n + k)"]),
  entry("sort-race", "Sort race", Group.SORTING, "Two sorts on the same input, side by side", ["–", "–", "–", "–"]),

  entry("bst", "Binary search tree", Group.TREES, "Smaller keys left, larger keys right", ["O(log n)", "O(log n)", "O(n)", "O(n)"]),
  entry("avl-tree", "AVL tree", Group.TREES, "A search tree that rotates to stay balanced", ["O(log n)", "O(log n)", "O(log n)", "O(n)"]),
  entry("red-black-tree", "Red-black tree", Group.TREES, "Colour rules keep the longest path short", ["O(log n)", "O(log n)", "O(log n)", "O(n)"]),
  entry("splay-tree", "Splay tree", Group.TREES, "Every access moves the key to the root", ["O(1)", "O(log n) amortised", "O(n)", "O(n)"]),
  entry("treap", "Treap", Group.TREES, "A search tree by key, a heap by random priority", ["O(log n)", "O(log n) expected", "O(n)", "O(n)"]),
  entry("b-tree", "B-tree", Group.TREES, "Wide nodes that split, for data on disk", ["O(log n)", "O(log n)", "O(log n)", "O(n)"]),
  entry("b-plus-tree", "B+ tree", Group.TREES, "All keys in linked leaves, for range scans", ["O(log n)", "O(log n)", "O(log n)", "O(n)"]),
  entry("trie", "Trie", Group.TREES, "A tree of letters where words share prefixes", ["O(m)", "O(m)", "O(m)", "O(total letters)"]),
  entry("binary-heap", "Binary heap", Group.TREES, "The smallest key always on top", ["O(1)", "O(log n)", "O(log n)", "O(n)"]),
  entry("segment-tree", "Segment tree", Group.TREES, "Range sums with updates in log time", ["O(log n)", "O(log n)", "O(log n)", "O(n)"]),
  entry("fenwick-tree", "Fenwick tree", Group.TREES, "Prefix sums in one array, by lowest set bit", ["O(log n)", "O(log n)", "O(log n)", "O(n)"]),
  entry("interval-tree", "Interval tree", Group.TREES, "Find every interval that overlaps a range", ["O(log n + k)", "O(log n + k)", "O(n)", "O(n)"]),
  entry("kd-tree", "k-d tree", Group.TREES, "Split the plane by x, then y, to find neighbours", ["O(log n)", "O(log n)", "O(n)", "O(n)"]),
  entry("union-find", "Union-find", Group.TREES, "Disjoint sets with ranks and path compression", ["O(1)", "O(α(n))", "O(log n)", "O(n)"]),
  entry("huffman-tree", "Huffman tree", Group.TREES, "Short codes for frequent symbols", ["O(n log n)", "O(n log n)", "O(n log n)", "O(n)"]),

  entry("bfs", "Breadth-first search", Group.GRAPHS, "Explore in rings: fewest edges first", ["O(V + E)", "O(V + E)", "O(V + E)", "O(V)"]),
  entry("dfs", "Depth-first search", Group.GRAPHS, "Go deep, back up, go deep again", ["O(V + E)", "O(V + E)", "O(V + E)", "O(V)"]),
  entry("dijkstra", "Dijkstra", Group.GRAPHS, "Shortest paths with non-negative weights", ["O(E log V)", "O(E log V)", "O(E log V)", "O(V)"]),
  entry("a-star", "A* search", Group.GRAPHS, "Dijkstra steered by a distance estimate", ["O(E)", "O(E log V)", "O(E log V)", "O(V)"]),
  entry("bellman-ford", "Bellman-Ford", Group.GRAPHS, "Shortest paths with negative weights", ["O(E)", "O(V·E)", "O(V·E)", "O(V)"]),
  entry("floyd-warshall", "Floyd-Warshall", Group.GRAPHS, "Every shortest distance, all pairs", ["O(V³)", "O(V³)", "O(V³)", "O(V²)"]),
  entry("prim", "Prim", Group.GRAPHS, "Grow a minimum spanning tree from one node", ["O(E log V)", "O(E log V)", "O(E log V)", "O(V)"]),
  entry("kruskal", "Kruskal", Group.GRAPHS, "Cheapest edges first, unless they close a cycle", ["O(E log E)", "O(E log E)", "O(E log E)", "O(V)"]),
  entry("topological-sort", "Topological sort", Group.GRAPHS, "Order tasks so every edge points forward", ["O(V + E)", "O(V + E)", "O(V + E)", "O(V)"]),
  entry("tarjan-scc", "Tarjan's components", Group.GRAPHS, "Groups of nodes that all reach each other", ["O(V + E)", "O(V + E)", "O(V + E)", "O(V)"]),
  entry("max-flow", "Max flow", Group.GRAPHS, "Edmonds-Karp: push flow along shortest paths", ["O(V·E²)", "O(V·E²)", "O(V·E²)", "O(V + E)"]),

  entry("stack", "Stack", Group.STRUCTURES, "Last in, first out", ["O(1)", "O(1)", "O(1)", "O(n)"]),
  entry("queue", "Queue", Group.STRUCTURES, "First in, first out", ["O(1)", "O(1)", "O(1)", "O(n)"]),
  entry("deque", "Deque", Group.STRUCTURES, "Add and remove at both ends", ["O(1)", "O(1)", "O(1)", "O(n)"]),
  entry("ring-buffer", "Ring buffer", Group.STRUCTURES, "A fixed array used in a circle", ["O(1)", "O(1)", "O(1)", "O(n)"]),
  entry("singly-linked-list", "Singly linked list", Group.STRUCTURES, "Nodes that point to the next one", ["O(1)", "O(n)", "O(n)", "O(n)"]),
  entry("doubly-linked-list", "Doubly linked list", Group.STRUCTURES, "Nodes that point both ways", ["O(1)", "O(n)", "O(n)", "O(n)"]),
  entry("hash-table", "Hash table", Group.STRUCTURES, "Keys to slots; chaining or probing on collisions", ["O(1)", "O(1)", "O(n)", "O(n)"]),
  entry("bloom-filter", "Bloom filter", Group.STRUCTURES, "Maybe yes, definitely no, in a few bits", ["O(k)", "O(k)", "O(k)", "O(m)"]),
  entry("lru-cache", "LRU cache", Group.STRUCTURES, "Evict whatever was used longest ago", ["O(1)", "O(1)", "O(1)", "O(n)"]),
  entry("skip-list", "Skip list", Group.STRUCTURES, "A sorted list with express lanes", ["O(log n)", "O(log n)", "O(n)", "O(n)"]),
  entry("consistent-hashing", "Consistent hashing", Group.STRUCTURES, "Servers on a ring; few keys move on change", ["O(log n)", "O(log n)", "O(n)", "O(n)"]),

  entry("rle", "Run-length encoding", Group.COMPRESSION, "Runs become a count and a symbol", ["O(n)", "O(n)", "O(n)", "O(n)"]),
  entry("lz77", "LZ77", Group.COMPRESSION, "Copy from a sliding window: distance, length, next", ["O(n·w)", "O(n·w)", "O(n·w)", "O(w)"]),
  entry("lz78", "LZ78", Group.COMPRESSION, "Grow a phrase dictionary while reading", ["O(n)", "O(n)", "O(n)", "O(n)"]),
  entry("lzw", "LZW", Group.COMPRESSION, "Output codes only; the dictionary rebuilds itself", ["O(n)", "O(n)", "O(n)", "O(n)"]),
  entry("bwt-mtf", "BWT + move-to-front", Group.COMPRESSION, "Sort rotations to group equal characters", ["O(n log n)", "O(n² log n)", "O(n² log n)", "O(n²)"]),
  entry("base64", "Base64", Group.COMPRESSION, "3 bytes become 4 safe characters", ["O(n)", "O(n)", "O(n)", "O(n)"]),
];

export type AlgorithmId = string;

export const ALGORITHM_IDS = CATALOG.map((item) => item.id) as [string, ...string[]];

export const entry_for = (id: string): CatalogEntry | undefined => CATALOG.find((item) => item.id === id);

export const in_group = (group: Group): CatalogEntry[] => CATALOG.filter((item) => item.group === group);
