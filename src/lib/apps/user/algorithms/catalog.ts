export const Group = {
  SORTING: "sorting",
} as const;
export type Group = (typeof Group)[keyof typeof Group];

export const GROUP_NAMES: Record<Group, string> = {
  [Group.SORTING]: "Sorting",
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
];

export type AlgorithmId = string;

export const ALGORITHM_IDS = CATALOG.map((item) => item.id) as [string, ...string[]];

export const entry_for = (id: string): CatalogEntry | undefined => CATALOG.find((item) => item.id === id);

export const in_group = (group: Group): CatalogEntry[] => CATALOG.filter((item) => item.group === group);
