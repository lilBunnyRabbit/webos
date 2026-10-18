import type { Definition } from "../../engine/definition";
import hashing from "./hashing";
import linear from "./linear";

export default {
  stack: linear.stack,
  queue: linear.queue,
  deque: linear.deque,
  "ring-buffer": linear.ring,
  "singly-linked-list": linear.singly,
  "doubly-linked-list": linear.doubly,
  "hash-table": hashing.hash_table,
  "bloom-filter": hashing.bloom,
  "lru-cache": linear.lru,
  "skip-list": hashing.skip,
  "consistent-hashing": hashing.consistent,
} as unknown as Record<string, Definition>;
