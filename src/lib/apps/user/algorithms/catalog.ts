export const Group = {
  SORTING: "sorting",
  TREES: "trees",
} as const;
export type Group = (typeof Group)[keyof typeof Group];

export const GROUP_NAMES: Record<Group, string> = {
  [Group.SORTING]: "Sorting",
  [Group.TREES]: "Trees",
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
];

export type AlgorithmId = string;

export const ALGORITHM_IDS = CATALOG.map((item) => item.id) as [string, ...string[]];

export const entry_for = (id: string): CatalogEntry | undefined => CATALOG.find((item) => item.id === id);

export const in_group = (group: Group): CatalogEntry[] => CATALOG.filter((item) => item.group === group);
