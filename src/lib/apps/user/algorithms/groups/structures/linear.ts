import { define } from "../../engine/definition";
import { random_int } from "../../engine/inputs";
import { op, ops_operations, ops_spec, type Op, type Verb } from "../../engine/ops";
import { grid, Tone, type Cell, type Pointer, type Step } from "../../engine/step";

const random_values = (verbs: [string, string], count = 8): Op[] => {
  const ops: Op[] = [];
  for (let i = 0; i < count; i++) ops.push(Math.random() < 0.65 || ops.length < 2 ? op(verbs[0], random_int(1, 99)) : op(verbs[1]));
  return ops;
};

const STACK_VERBS: Record<string, Verb> = { push: { label: "Push", value: "number" }, pop: { label: "Pop", value: null }, peek: { label: "Peek", value: null } };

const stack = define({
  intro:
    "A stack keeps items in a pile: you only ever add to the top (push) and take from the top (pop), so the last thing in is the first thing out. Both are O(1). That last-in-first-out order is exactly how function calls nest, how undo works, and how you match brackets.",
  use: "Undo history, the call stack, expression evaluation, bracket matching, depth-first search.",
  traits: ["LIFO", "O(1) push and pop"],
  pseudocode: ["push(x): top ← top + 1; a[top] ← x", "pop(): if empty: underflow", "  x ← a[top]; top ← top − 1; return x", "peek(): return a[top]"],
  input: ops_spec({ verbs: STACK_VERBS, sample: [op("push", 4), op("push", 8), op("push", 15), op("pop"), op("push", 16), op("peek"), op("pop"), op("pop")], random: () => random_values(["push", "pop"]) }),
  operations: ops_operations(STACK_VERBS),
  *run(ops: Op[]) {
    const items: number[] = [];
    const out: (number | null)[] = [];
    const frame = (note: string, line: number, tone?: Tone): Step => ({
      views: [
        grid({
          title: "stack",
          row_labels: items.map((_, i) => (i === items.length - 1 ? "top" : "")).reverse(),
          rows: items.length ? [...items].reverse().map((value, i) => [{ text: String(value), tone: i === 0 ? tone : undefined }]) : [[{ text: "empty", tone: Tone.MUTED }]],
        }),
        { kind: "text", title: "popped", lines: out.map((value) => ({ text: value === null ? "underflow" : String(value), tone: value === null ? Tone.BAD : undefined })) },
      ],
      line,
      note,
      counters: { size: items.length },
    });
    yield frame("An empty stack.", -1);
    for (const item of ops) {
      if (item.op === "push") {
        items.push(Number(item.value));
        yield frame(`Push ${item.value} on top.`, 0, Tone.WARN);
      } else if (items.length === 0) {
        if (item.op === "pop") out.push(null);
        yield frame(`${item.op === "pop" ? "Pop" : "Peek"} on an empty stack: underflow, nothing to take.`, 1);
      } else if (item.op === "pop") {
        yield frame(`Pop: the top is ${items.at(-1)}.`, 2, Tone.ACTIVE);
        out.push(items.pop()!);
        yield frame(`Took ${out.at(-1)} off the top.`, 2);
      } else yield frame(`Peek: the top is ${items.at(-1)}, and it stays.`, 3, Tone.ACTIVE);
    }
    return { items, popped: out };
  },
});

const QUEUE_VERBS: Record<string, Verb> = { enqueue: { label: "Enqueue", value: "number" }, dequeue: { label: "Dequeue", value: null }, peek: { label: "Peek", value: null } };

const ends = (length: number, front = "front", back = "back"): Pointer[] =>
  length === 0 ? [] : length === 1 ? [{ index: 0, label: `${front}·${back}` }] : [{ index: 0, label: front }, { index: length - 1, label: back }];

const queue = define({
  intro:
    "A queue is a line: items join at the back and leave from the front, so the first in is the first out. Both ends are O(1) with a linked list or a ring buffer. It is how work waits its turn.",
  use: "Task and print queues, message passing, breadth-first search, buffering between a producer and a consumer.",
  traits: ["FIFO", "O(1) at both ends"],
  pseudocode: ["enqueue(x): add x at the back", "dequeue(): if empty: underflow", "  take the item at the front", "peek(): look at the front"],
  input: ops_spec({ verbs: QUEUE_VERBS, sample: [op("enqueue", 3), op("enqueue", 7), op("enqueue", 1), op("dequeue"), op("enqueue", 9), op("dequeue"), op("peek")], random: () => random_values(["enqueue", "dequeue"]) }),
  operations: ops_operations(QUEUE_VERBS),
  *run(ops: Op[]) {
    const items: number[] = [];
    const out: number[] = [];
    const frame = (note: string, line: number, tones: Record<number, Tone> = {}): Step => ({
      views: [
        { kind: "chain", title: "queue", items: items.map((value, i) => ({ text: String(value), tone: tones[i] })), pointers: ends(items.length) },
        { kind: "text", title: "dequeued", lines: out.map((value) => ({ text: String(value) })) },
      ],
      line,
      note,
      counters: { size: items.length },
    });
    yield frame("An empty queue.", -1);
    for (const item of ops) {
      if (item.op === "enqueue") {
        items.push(Number(item.value));
        yield frame(`${item.value} joins at the back.`, 0, { [items.length - 1]: Tone.WARN });
      } else if (items.length === 0) yield frame(`${item.op === "dequeue" ? "Dequeue" : "Peek"} on an empty queue: nothing there.`, 1);
      else if (item.op === "dequeue") {
        yield frame(`Dequeue: ${items[0]} is at the front.`, 2, { 0: Tone.ACTIVE });
        out.push(items.shift()!);
        yield frame(`${out.at(-1)} leaves; ${items.length ? `${items[0]} is the front now` : "the queue is empty"}.`, 2);
      } else yield frame(`Peek: ${items[0]} is at the front.`, 3, { 0: Tone.ACTIVE });
    }
    return { items, dequeued: out };
  },
});

const DEQUE_VERBS: Record<string, Verb> = {
  push_back: { label: "Push back", value: "number" },
  push_front: { label: "Push front", value: "number" },
  pop_front: { label: "Pop front", value: null },
  pop_back: { label: "Pop back", value: null },
};

const deque = define({
  intro:
    "A double-ended queue lets you add and remove at both ends in O(1). It can act as a stack, a queue, or both at once. Usually it's a ring buffer that grows, or a list of fixed-size blocks.",
  use: "Sliding-window maximum, work stealing between threads, undo with a size limit, palindrome checks.",
  traits: ["Both ends", "O(1)"],
  pseudocode: ["push_front(x) / push_back(x): add at that end", "pop_front() / pop_back(): if empty: underflow", "  take the item at that end"],
  input: ops_spec({
    verbs: DEQUE_VERBS,
    sample: [op("push_back", 5), op("push_back", 6), op("push_front", 4), op("push_front", 3), op("pop_back"), op("pop_front"), op("push_back", 9)],
    random: () => {
      const names = Object.keys(DEQUE_VERBS);
      return Array.from({ length: 9 }, (_, i) => {
        const name = i < 2 ? names[i % 2] : names[random_int(0, 3)];
        return DEQUE_VERBS[name].value ? op(name, random_int(1, 99)) : op(name);
      });
    },
  }),
  operations: ops_operations(DEQUE_VERBS),
  *run(ops: Op[]) {
    const items: number[] = [];
    const frame = (note: string, line: number, tones: Record<number, Tone> = {}): Step => ({
      views: [{ kind: "chain", title: "deque", double: true, items: items.map((value, i) => ({ text: String(value), tone: tones[i] })), pointers: ends(items.length) }],
      line,
      note,
      counters: { size: items.length },
    });
    yield frame("An empty deque.", -1);
    for (const item of ops) {
      const front = item.op.endsWith("front");
      if (item.op.startsWith("push")) {
        if (front) items.unshift(Number(item.value));
        else items.push(Number(item.value));
        yield frame(`Add ${item.value} at the ${front ? "front" : "back"}.`, 0, { [front ? 0 : items.length - 1]: Tone.WARN });
      } else if (items.length === 0) yield frame("Nothing to take: the deque is empty.", 1);
      else {
        const index = front ? 0 : items.length - 1;
        yield frame(`Take ${items[index]} from the ${front ? "front" : "back"}.`, 2, { [index]: Tone.ACTIVE });
        if (front) items.shift();
        else items.pop();
        yield frame(`${items.length} left.`, 2);
      }
    }
    return { items };
  },
});

const RING_VERBS: Record<string, Verb> = { write: { label: "Write", value: "number" }, read: { label: "Read", value: null } };

const ring = define({
  intro:
    "A ring buffer is a fixed array used in a circle. A write index and a read index chase each other around; when one passes the end it wraps to 0. Nothing ever moves in memory, so writes and reads are O(1) with no allocation. When it's full you either refuse the write or overwrite the oldest item.",
  use: "Audio and network buffers, logs that keep the last N entries, keyboard input, producer–consumer queues.",
  traits: ["Fixed size", "Wraps around", "No allocation"],
  pseudocode: [
    "write(x): if full: refuse, or overwrite the oldest (move read on)",
    "  a[write] ← x; write ← (write + 1) mod n; count ← count + 1",
    "read(): if empty: nothing to read",
    "  x ← a[read]; read ← (read + 1) mod n; count ← count − 1",
  ],
  input: ops_spec({
    verbs: RING_VERBS,
    sample: [op("write", 1), op("write", 2), op("write", 3), op("read"), op("write", 4), op("write", 5), op("write", 6), op("write", 7), op("write", 8), op("read"), op("read")],
    random: () => random_values(["write", "read"], 12),
  }),
  params: [
    { id: "capacity", label: "Capacity", kind: "number", min: 3, max: 12, default: 5 },
    {
      id: "full",
      label: "When full",
      kind: "choice",
      choices: [
        { value: "overwrite", label: "Overwrite the oldest" },
        { value: "reject", label: "Refuse the write" },
      ],
      default: "overwrite",
    },
  ],
  operations: ops_operations(RING_VERBS),
  *run(ops: Op[], params) {
    const n = Number(params.capacity ?? 5);
    const overwrite = params.full !== "reject";
    const a: (number | null)[] = new Array(n).fill(null);
    let read = 0;
    let write = 0;
    let count = 0;
    let lost = 0;
    const out: number[] = [];
    const frame = (note: string, line: number, tones: Record<number, Tone> = {}): Step => {
      const live = new Set<number>();
      for (let i = 0; i < count; i++) live.add((read + i) % n);
      const cells: Cell[] = a.map((value, i) => ({ text: value === null || !live.has(i) ? "" : String(value), tone: tones[i] ?? (live.has(i) ? undefined : Tone.MUTED) }));
      return {
        views: [
          { kind: "ring", title: "buffer", cells, pointers: [{ index: read, label: "read", tone: Tone.COMPARE }, { index: write, label: "write", tone: Tone.WARN }] },
          { kind: "text", title: "read out", lines: out.map((value) => ({ text: String(value) })) },
        ],
        line,
        note,
        counters: { count, capacity: n, overwritten: lost },
      };
    };
    yield frame(`An empty ring of ${n} slots. Read and write both start at 0.`, -1);
    for (const item of ops) {
      if (item.op === "write") {
        if (count === n) {
          if (!overwrite) {
            yield frame(`Full: the write of ${item.value} is refused.`, 0, { [write]: Tone.BAD });
            continue;
          }
          lost++;
          yield frame(`Full: ${a[read]} is the oldest and gets overwritten. Read moves on.`, 0, { [read]: Tone.BAD });
          read = (read + 1) % n;
          count--;
        }
        a[write] = Number(item.value);
        const at = write;
        write = (write + 1) % n;
        count++;
        yield frame(`Write ${item.value} at ${at}; write moves to ${write}${write === 0 && at === n - 1 ? " (wrapped round)" : ""}.`, 1, { [at]: Tone.WARN });
      } else if (count === 0) yield frame("Read: the buffer is empty.", 2);
      else {
        const at = read;
        out.push(a[at]!);
        read = (read + 1) % n;
        count--;
        yield frame(`Read ${a[at]} from ${at}; read moves to ${read}.`, 3, { [at]: Tone.ACTIVE });
      }
    }
    const left: number[] = [];
    for (let i = 0; i < count; i++) left.push(a[(read + i) % n]!);
    return { read: out, left };
  },
});

const LIST_VERBS: Record<string, Verb> = {
  add_back: { label: "Add at the back", value: "number" },
  add_front: { label: "Add at the front", value: "number" },
  remove: { label: "Remove", value: "number" },
  find: { label: "Find", value: "number" },
};

function linked(double: boolean) {
  return define({
    intro: double
      ? "Each node points to the next and to the previous node. That second pointer costs memory, but lets you walk backwards and unlink a node you already hold in O(1): its neighbours just point past it. Removing the last node is O(1) too."
      : "Each node holds a value and a pointer to the next node; the list keeps its head (and here its tail). Adding at either end is O(1). Finding or removing a value means walking from the head, O(n), because you can only go forward.",
    use: double
      ? "LRU caches, browser history, text editor buffers, any list where you remove from the middle often."
      : "Stacks and queues without a size limit, hash table buckets, adjacency lists, persistent (immutable) lists.",
    traits: double ? ["Two pointers per node", "O(1) unlink"] : ["One pointer per node", "Forward only"],
    pseudocode: double
      ? [
          "add_back(x): node.prev ← tail; tail.next ← node; tail ← node",
          "add_front(x): node.next ← head; head.prev ← node; head ← node",
          "find(x): cur ← head; while cur and cur.value ≠ x: cur ← cur.next",
          "remove(x): cur ← find(x)",
          "  cur.prev.next ← cur.next; cur.next.prev ← cur.prev",
        ]
      : [
          "add_back(x): tail.next ← node; tail ← node",
          "add_front(x): node.next ← head; head ← node",
          "find(x): cur ← head; while cur and cur.value ≠ x: cur ← cur.next",
          "remove(x): walk with prev and cur until cur.value = x",
          "  prev.next ← cur.next (or head ← cur.next)",
        ],
    input: ops_spec({
      verbs: LIST_VERBS,
      sample: [op("add_back", 3), op("add_back", 8), op("add_front", 1), op("add_back", 5), op("find", 8), op("remove", 8), op("remove", 1)],
      random: () => [...Array.from({ length: 5 }, () => op("add_back", random_int(1, 50))), op("add_front", random_int(1, 50)), op("find", random_int(1, 50))],
    }),
    operations: ops_operations(LIST_VERBS),
    *run(ops: Op[]) {
      const items: number[] = [];
      let hops = 0;
      const found: boolean[] = [];
      const frame = (note: string, line: number, tones: Record<number, Tone> = {}, cursor?: number): Step => {
        const pointers: Pointer[] = ends(items.length, "head", "tail");
        if (cursor !== undefined && cursor < items.length) pointers.push({ index: cursor, label: "cur", tone: Tone.ACTIVE });
        return { views: [{ kind: "chain", title: double ? "doubly linked list" : "singly linked list", double, items: items.map((value, i) => ({ text: String(value), tone: tones[i] })), pointers }], line, note, counters: { length: items.length, hops } };
      };
      function* walk(target: number, line: number): Generator<Step, number> {
        for (let i = 0; i < items.length; i++) {
          hops++;
          if (items[i] === target) {
            yield frame(`cur holds ${items[i]}: found it.`, line, { [i]: Tone.DONE }, i);
            return i;
          }
          yield frame(`cur holds ${items[i]}, not ${target}: follow next.`, line, { [i]: Tone.COMPARE }, i);
        }
        yield frame(`Reached null: ${target} isn't in the list.`, line);
        return -1;
      }
      yield frame("An empty list: head and tail are null.", -1);
      for (const item of ops) {
        const value = Number(item.value);
        if (item.op === "add_back") {
          items.push(value);
          yield frame(`New node ${value}: the old tail points to it, and it becomes the tail.`, 0, { [items.length - 1]: Tone.WARN });
        } else if (item.op === "add_front") {
          items.unshift(value);
          yield frame(`New node ${value} points to the old head and becomes the head.`, 1, { 0: Tone.WARN });
        } else if (item.op === "find") {
          found.push((yield* walk(value, 2)) >= 0);
        } else {
          const at = yield* walk(value, 3);
          if (at < 0) continue;
          yield frame(
            double
              ? `Unlink ${value}: its neighbours now point past it, both ways.`
              : at === 0
                ? `${value} is the head: the head moves to the next node.`
                : `The node before it now points past ${value}.`,
            4,
            { [at]: Tone.BAD, ...(at > 0 ? { [at - 1]: Tone.WARN } : {}), ...(double && at < items.length - 1 ? { [at + 1]: Tone.WARN } : {}) },
            at
          );
          items.splice(at, 1);
          yield frame(`${value} is gone.`, 4);
        }
      }
      return { items, found };
    },
  });
}

const LRU_VERBS: Record<string, Verb> = { get: { label: "Get", value: "word" }, put: { label: "Put", value: "word" } };

const lru = define({
  intro:
    "A cache with room for n items that, when full, throws out the least recently used one. A hash map finds an entry in O(1); a doubly linked list keeps entries in order of use, with the most recent at the front. Every get or put moves its entry to the front, so the back is always the one to evict.",
  use: "Page caches in operating systems and databases, CDN and browser caches, memoising expensive calls.",
  traits: ["Hash map + linked list", "O(1) get and put"],
  pseudocode: [
    "get(k): if k isn't in the map: a miss",
    "  hit: move k's node to the front; return it",
    "put(k): if k is in the map: update it, move it to the front",
    "  full: evict the node at the back, and its map entry",
    "  add k at the front",
  ],
  input: ops_spec({
    verbs: LRU_VERBS,
    sample: [op("put", "a"), op("put", "b"), op("put", "c"), op("get", "a"), op("put", "d"), op("get", "b"), op("get", "c"), op("put", "e")],
    random: () => Array.from({ length: 12 }, () => op(Math.random() < 0.5 ? "get" : "put", "abcdef"[random_int(0, 5)])),
  }),
  params: [{ id: "capacity", label: "Capacity", kind: "number", min: 2, max: 6, default: 3 }],
  operations: ops_operations(LRU_VERBS),
  *run(ops: Op[], params) {
    const capacity = Number(params.capacity ?? 3);
    const order: string[] = [];
    let hits = 0;
    let misses = 0;
    let evictions = 0;
    const frame = (note: string, line: number, tones: Record<number, Tone> = {}): Step => ({
      views: [{ kind: "chain", title: "most recent → least recent", double: true, items: order.map((key, i) => ({ text: key, tone: tones[i] })), pointers: order.length ? [{ index: order.length - 1, label: "evict next", tone: Tone.MUTED }] : [] }],
      line,
      note,
      counters: { hits, misses, evictions, size: `${order.length}/${capacity}` },
    });
    yield frame(`An empty cache with room for ${capacity}.`, -1);
    for (const item of ops) {
      const key = item.value!;
      const at = order.indexOf(key);
      if (item.op === "get") {
        if (at < 0) {
          misses++;
          yield frame(`get ${key}: not cached, a miss.`, 0);
          continue;
        }
        hits++;
        yield frame(`get ${key}: a hit.`, 1, { [at]: Tone.DONE });
        order.splice(at, 1);
        order.unshift(key);
        yield frame(`Move ${key} to the front: it's the most recently used now.`, 1, { 0: Tone.ACTIVE });
        continue;
      }
      if (at >= 0) {
        order.splice(at, 1);
        order.unshift(key);
        yield frame(`put ${key}: already cached, refresh it and move it to the front.`, 2, { 0: Tone.ACTIVE });
        continue;
      }
      if (order.length === capacity) {
        yield frame(`Full: evict ${order.at(-1)}, the least recently used.`, 3, { [order.length - 1]: Tone.BAD });
        order.pop();
        evictions++;
      }
      order.unshift(key);
      yield frame(`Add ${key} at the front.`, 4, { 0: Tone.WARN });
    }
    return { order, hits, misses, evictions };
  },
});

export default { stack, queue, deque, ring, singly: linked(false), doubly: linked(true), lru };
