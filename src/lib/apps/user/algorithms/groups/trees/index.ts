import type { Definition } from "../../engine/definition";
import binary from "./binary";
import forests from "./forests";
import multiway from "./multiway";
import ranges from "./ranges";

export default {
  bst: binary.bst,
  "avl-tree": binary.avl,
  "red-black-tree": binary.red_black,
  "splay-tree": binary.splay,
  treap: binary.treap,
  "b-tree": multiway.b_tree,
  "b-plus-tree": multiway.b_plus,
  trie: multiway.trie,
  "binary-heap": forests.heap,
  "segment-tree": ranges.segment,
  "fenwick-tree": ranges.fenwick,
  "interval-tree": ranges.interval,
  "kd-tree": ranges.kd,
  "union-find": forests.union_find,
  "huffman-tree": forests.huffman,
} as unknown as Record<string, Definition>;
