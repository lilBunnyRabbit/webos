import { define } from "../../engine/definition";
import { random_int, shuffled } from "../../engine/inputs";
import { hash_string, op, ops_operations, ops_spec, type Op, type Verb } from "../../engine/ops";
import { grid, Tone, type Cell, type Step, type View } from "../../engine/step";

const TABLE_VERBS: Record<string, Verb> = {
  insert: { label: "Insert", value: "number" },
  find: { label: "Find", value: "number" },
  delete: { label: "Delete", value: "number" },
};

const TOMBSTONE = -1;

const hash_table = define({
  intro:
    "A hash table turns a key into an array index with a hash function, so lookups take O(1) on average. Two keys can land in the same slot: a collision. Chaining keeps a small list per slot; open addressing instead probes other slots (one by one, by growing squares, or by a second hash) until it finds a free one.",
  use: "Dictionaries and sets in every language, caches, symbol tables, de-duplication, counting.",
  traits: ["O(1) average", "Collisions"],
  pseudocode: [
    "h(k) = k mod m",
    "chaining: append k to the list at slot h(k)",
    "probing: try h(k), then the next slot in the probe sequence",
    "  linear: h + i · quadratic: h + i² · double: h + i · h2(k), h2(k) = 1 + k mod (m − 1)",
    "  stop at an empty slot (insert there) or at k (found)",
    "delete with probing: leave a tombstone so later probes keep going",
  ],
  input: ops_spec({
    verbs: TABLE_VERBS,
    sample: [op("insert", 15), op("insert", 22), op("insert", 8), op("insert", 29), op("insert", 3), op("find", 29), op("delete", 22), op("find", 29), op("insert", 36)],
    random: () => [...Array.from({ length: 6 }, () => op("insert", random_int(1, 60))), op("find", random_int(1, 60))],
  }),
  params: [
    {
      id: "method",
      label: "Collisions",
      kind: "choice",
      choices: [
        { value: "chaining", label: "Chaining" },
        { value: "linear", label: "Linear probing" },
        { value: "quadratic", label: "Quadratic probing" },
        { value: "double", label: "Double hashing" },
      ],
      default: "linear",
    },
    { id: "size", label: "Table size m", kind: "number", min: 5, max: 17, default: 7 },
  ],
  operations: ops_operations(TABLE_VERBS),
  *run(ops: Op[], params) {
    const m = Number(params.size ?? 7);
    const method = String(params.method ?? "linear");
    const chains: number[][] = Array.from({ length: m }, () => []);
    const slots: (number | null)[] = new Array(m).fill(null);
    let probes = 0;
    let collisions = 0;
    const found: boolean[] = [];
    const view = (marks: Record<number, Tone> = {}, mark_key?: number): View =>
      method === "chaining"
        ? grid({
            title: "buckets",
            row_labels: chains.map((_, i) => String(i)),
            rows: chains.map((chain, i) => (chain.length ? chain.map((key) => ({ text: String(key), tone: key === mark_key && marks[i] ? marks[i] : undefined })) : [{ text: "·", tone: marks[i] ?? Tone.MUTED }])),
          })
        : grid({
            title: "slots",
            col_labels: slots.map((_, i) => String(i)),
            rows: [slots.map((value, i): Cell => ({ text: value === null ? "" : value === TOMBSTONE ? "†" : String(value), tone: marks[i] ?? (value === TOMBSTONE ? Tone.MUTED : undefined) }))],
          });
    const load = () => (method === "chaining" ? chains.reduce((sum, chain) => sum + chain.length, 0) : slots.filter((value) => value !== null && value !== TOMBSTONE).length);
    const frame = (note: string, line: number, marks: Record<number, Tone> = {}, mark_key?: number): Step => ({
      views: [view(marks, mark_key)],
      line,
      note,
      counters: { probes, collisions, "load factor": (load() / m).toFixed(2) },
    });
    const h2 = (k: number) => 1 + (k % (m - 1));
    const probe = (k: number, i: number) => {
      const h = k % m;
      if (method === "linear") return (h + i) % m;
      if (method === "quadratic") return (h + i * i) % m;
      return (h + i * h2(k)) % m;
    };
    yield frame(`An empty table of ${m} slots, ${method === "chaining" ? "chaining" : `${method} probing`}.`, -1);
    for (const item of ops) {
      const k = Math.abs(Number(item.value));
      const h = k % m;
      yield frame(`${item.op[0].toUpperCase()}${item.op.slice(1)} ${k}: h(${k}) = ${k} mod ${m} = ${h}.`, 0, { [h]: Tone.ACTIVE });
      if (method === "chaining") {
        probes++;
        const chain = chains[h];
        const at = chain.indexOf(k);
        if (item.op === "insert") {
          if (at >= 0) yield frame(`${k} is already in bucket ${h}.`, 1, { [h]: Tone.MARK }, k);
          else {
            if (chain.length) collisions++;
            chain.push(k);
            yield frame(chain.length > 1 ? `Bucket ${h} is taken: a collision. Append ${k} to its list.` : `Put ${k} in bucket ${h}.`, 1, { [h]: Tone.WARN }, k);
          }
        } else if (item.op === "find") {
          found.push(at >= 0);
          yield frame(at >= 0 ? `Scan bucket ${h}: ${k} is there.` : `Scan bucket ${h}: ${k} isn't there.`, 1, { [h]: at >= 0 ? Tone.DONE : Tone.BAD }, k);
        } else {
          if (at >= 0) chain.splice(at, 1);
          yield frame(at >= 0 ? `Remove ${k} from bucket ${h}'s list.` : `${k} isn't in bucket ${h}.`, 1, { [h]: at >= 0 ? Tone.WARN : Tone.BAD });
        }
        continue;
      }
      let placed = false;
      let first_tombstone = -1;
      for (let i = 0; i < m; i++) {
        const at = probe(k, i);
        probes++;
        const value = slots[at];
        const step = i === 0 ? "" : ` Probe ${i}: slot ${at}.`;
        if (value === null) {
          if (item.op === "insert") {
            const target = first_tombstone >= 0 ? first_tombstone : at;
            slots[target] = k;
            yield frame(`${step} Slot ${target} is free${first_tombstone >= 0 ? " (reusing a tombstone)" : ""}: put ${k} there.`.trim(), 4, { [target]: Tone.WARN });
          } else {
            if (item.op === "find") found.push(false);
            yield frame(`${step} Slot ${at} is empty: ${k} isn't in the table.`.trim(), 4, { [at]: Tone.BAD });
          }
          placed = true;
          break;
        }
        if (value === k) {
          if (item.op === "insert") yield frame(`${step} ${k} is already here.`.trim(), 4, { [at]: Tone.MARK });
          else if (item.op === "find") {
            found.push(true);
            yield frame(`${step} Found ${k} in slot ${at}.`.trim(), 4, { [at]: Tone.DONE });
          } else {
            slots[at] = TOMBSTONE;
            yield frame(`${step} Delete ${k}: leave a tombstone (†) so probes for keys after it don't stop early.`.trim(), 5, { [at]: Tone.WARN });
          }
          placed = true;
          break;
        }
        if (value === TOMBSTONE && first_tombstone < 0) first_tombstone = at;
        if (i === 0 && value !== TOMBSTONE) collisions++;
        yield frame(
          `${step} Slot ${at} holds ${value === TOMBSTONE ? "a tombstone" : value}: keep probing${method === "double" ? ` in steps of h2(${k}) = ${h2(k)}` : ""}.`.trim(),
          2,
          { [at]: Tone.COMPARE }
        );
      }
      if (!placed) {
        if (item.op === "insert" && first_tombstone >= 0) {
          slots[first_tombstone] = k;
          yield frame(`No empty slot on the probe path; reuse the tombstone at ${first_tombstone}.`, 4, { [first_tombstone]: Tone.WARN });
        } else {
          if (item.op === "find") found.push(false);
          yield frame(item.op === "insert" ? `The probe sequence found no free slot: the table is full for ${k}.` : `Every slot on the path was checked: ${k} isn't here.`, 3, {});
        }
      }
    }
    const keys = method === "chaining" ? chains.flat() : slots.filter((value): value is number => value !== null && value !== TOMBSTONE);
    return { keys: keys.sort((a, b) => a - b), found };
  },
});

const BLOOM_VERBS: Record<string, Verb> = { add: { label: "Add", value: "word" }, test: { label: "Test", value: "word" } };

const bloom = define({
  intro:
    "A Bloom filter answers 'have I seen this?' using a bit array and k hash functions. Adding sets k bits; testing checks those k bits. If any is 0, the item was never added. If all are 1, it was probably added, but other items may have set those bits: a false positive. It never gives a false negative, and it is tiny.",
  use: "Skipping disk lookups for keys that don't exist (databases like Cassandra, LevelDB), spam and malicious-URL lists, 'already seen' checks in crawlers.",
  traits: ["Probabilistic", "No false negatives", "Space-efficient"],
  pseudocode: [
    "add(x): for i in 1..k: bits[h_i(x) mod m] ← 1",
    "test(x): for i in 1..k:",
    "  if bits[h_i(x) mod m] = 0: definitely not added",
    "  all k bits set: probably added",
  ],
  input: ops_spec({
    verbs: BLOOM_VERBS,
    sample: [op("add", "cat"), op("add", "dog"), op("add", "fish"), op("test", "dog"), op("test", "bird"), op("test", "owl")],
    random: () => {
      const words = shuffled(["cat", "dog", "fish", "bird", "owl", "fox", "bee", "ant", "elk", "yak"]);
      return [...words.slice(0, 4).map((word) => op("add", word)), ...words.slice(2, 7).map((word) => op("test", word))];
    },
  }),
  params: [
    { id: "bits", label: "Bits m", kind: "number", min: 8, max: 48, default: 16 },
    { id: "hashes", label: "Hashes k", kind: "number", min: 1, max: 5, default: 3 },
  ],
  operations: ops_operations(BLOOM_VERBS),
  *run(ops: Op[], params) {
    const m = Number(params.bits ?? 16);
    const k = Number(params.hashes ?? 3);
    const bits = new Array(m).fill(0);
    const added: string[] = [];
    const results: { word: string; maybe: boolean; truth: boolean }[] = [];
    const per_row = 16;
    const positions = (word: string) => Array.from({ length: k }, (_, i) => hash_string(word, i * 0x9e3779b1) % m);
    const view = (marks: Record<number, Tone> = {}): View =>
      grid({
        title: "bits",
        row_labels: Array.from({ length: Math.ceil(m / per_row) }, (_, r) => String(r * per_row)),
        rows: Array.from({ length: Math.ceil(m / per_row) }, (_, r) => bits.slice(r * per_row, (r + 1) * per_row).map((bit, i) => ({ text: String(bit), tone: marks[r * per_row + i] ?? (bit ? Tone.MARK : undefined) }))),
      });
    const false_rate = () => Math.pow(1 - Math.exp((-k * added.length) / m), k);
    const frame = (note: string, line: number, marks: Record<number, Tone> = {}): Step => ({
      views: [view(marks), { kind: "text", title: "added", lines: added.map((text) => ({ text })) }],
      line,
      note,
      counters: { "bits set": bits.filter(Boolean).length, items: added.length, "false positive rate": `${(false_rate() * 100).toFixed(1)}%` },
    });
    yield frame(`${m} bits, all 0, and ${k} hash ${k === 1 ? "function" : "functions"}.`, -1);
    for (const item of ops) {
      const word = item.value!;
      const at = positions(word);
      if (item.op === "add") {
        at.forEach((position) => (bits[position] = 1));
        if (!added.includes(word)) added.push(word);
        yield frame(`Add “${word}”: its hashes point at ${at.join(", ")}. Set those bits.`, 0, Object.fromEntries(at.map((position) => [position, Tone.WARN])));
        continue;
      }
      const zero = at.find((position) => bits[position] === 0);
      const truth = added.includes(word);
      results.push({ word, maybe: zero === undefined, truth });
      if (zero !== undefined)
        yield frame(`Test “${word}”: bit ${zero} is 0, so “${word}” was definitely never added.`, 2, Object.fromEntries(at.map((position) => [position, bits[position] ? Tone.COMPARE : Tone.BAD])));
      else
        yield frame(
          truth ? `Test “${word}”: bits ${at.join(", ")} are all 1. Probably added, and it was.` : `Test “${word}”: bits ${at.join(", ")} are all 1, set by other words. A false positive: “${word}” was never added.`,
          3,
          Object.fromEntries(at.map((position) => [position, truth ? Tone.DONE : Tone.BAD]))
        );
    }
    return { results, bits };
  },
});

const RING_SLOTS = 32;

const HASH_RING_VERBS: Record<string, Verb> = {
  put: { label: "Place key", value: "word" },
  add_server: { label: "Add server", value: "word" },
  remove_server: { label: "Remove server", value: "word" },
};

const consistent = define({
  intro:
    "Consistent hashing puts servers and keys on the same circle of hash values. Each key belongs to the first server clockwise from it. Adding or removing a server only moves the keys in its one arc, about 1/n of them, instead of reshuffling everything as hash mod n would.",
  use: "Spreading data across cache or database servers that come and go: Dynamo, Cassandra, memcached clients, load balancers.",
  traits: ["Minimal remapping", "Ring"],
  pseudocode: [
    "place(x): position ← hash(x) mod 32 on the ring",
    "owner(key): walk clockwise from the key to the first server",
    "add server: only keys between it and the server before it move to it",
    "remove server: its keys move to the next server clockwise",
  ],
  input: ops_spec({
    verbs: HASH_RING_VERBS,
    sample: [op("add_server", "alpha"), op("add_server", "beta"), op("add_server", "gamma"), ...["cat", "dog", "fish", "bird", "owl", "fox", "bee"].map((key) => op("put", key)), op("add_server", "delta"), op("remove_server", "beta")],
    random: () => [op("add_server", "alpha"), op("add_server", "beta"), ...shuffled(["cat", "dog", "fish", "bird", "owl", "fox", "bee", "ant"]).slice(0, 6).map((key) => op("put", key)), op("add_server", "gamma")],
  }),
  operations: ops_operations(HASH_RING_VERBS),
  *run(ops: Op[]) {
    const servers = new Map<string, number>();
    const keys = new Map<string, number>();
    const taken = new Set<number>();
    let moved = 0;
    const place = (name: string) => {
      let at = hash_string(name) % RING_SLOTS;
      while (taken.has(at)) at = (at + 1) % RING_SLOTS;
      return at;
    };
    const owner = (position: number): string | null => {
      for (let i = 0; i < RING_SLOTS; i++) {
        const at = (position + i) % RING_SLOTS;
        for (const [name, slot] of servers) if (slot === at) return name;
      }
      return null;
    };
    const assignment = () => new Map([...keys].map(([key, position]) => [key, owner(position)]));
    const frame = (note: string, line: number, marks: Record<number, Tone> = {}, changed: Set<string> = new Set()): Step => {
      const cells: Cell[] = Array.from({ length: RING_SLOTS }, (_, i) => {
        const server = [...servers].find(([, slot]) => slot === i)?.[0];
        const key = [...keys].find(([, slot]) => slot === i)?.[0];
        return { text: server ? server.toUpperCase() : (key ?? ""), tone: marks[i] ?? (server ? Tone.MARK : key ? undefined : Tone.MUTED) };
      });
      const owners = assignment();
      return {
        views: [
          { kind: "ring", title: "hash ring (32 positions)", cells },
          grid({ title: "keys → server", row_labels: [...keys.keys()], rows: [...keys.keys()].map((key) => [{ text: owners.get(key) ?? "none", tone: changed.has(key) ? Tone.WARN : undefined }]) }),
        ],
        line,
        note,
        counters: { servers: servers.size, keys: keys.size, "keys moved": moved },
      };
    };
    yield frame("An empty ring.", -1);
    for (const item of ops) {
      const name = item.value!;
      if (item.op === "put") {
        if (keys.has(name)) {
          yield frame(`“${name}” is already placed.`, 0);
          continue;
        }
        const at = place(name);
        taken.add(at);
        keys.set(name, at);
        const server = owner(at);
        yield frame(server ? `“${name}” hashes to ${at}. Clockwise, the first server is ${server}.` : `“${name}” hashes to ${at}, but there's no server yet.`, server ? 1 : 0, { [at]: Tone.WARN, ...(server ? { [servers.get(server)!]: Tone.ACTIVE } : {}) });
        continue;
      }
      const before = assignment();
      if (item.op === "add_server") {
        if (servers.has(name)) {
          yield frame(`${name} is already on the ring.`, 2);
          continue;
        }
        const at = place(name);
        taken.add(at);
        servers.set(name, at);
        yield frame(`Server ${name} hashes to ${at}.`, 0, { [at]: Tone.ACTIVE });
      } else {
        const at = servers.get(name);
        if (at === undefined) {
          yield frame(`There's no server called ${name}.`, 3);
          continue;
        }
        servers.delete(name);
        taken.delete(at);
        yield frame(`Remove server ${name} from ${at}.`, 3, { [at]: Tone.BAD });
      }
      const after = assignment();
      const changed = new Set([...after].filter(([key, server]) => before.get(key) !== server).map(([key]) => key));
      moved += changed.size;
      yield frame(
        changed.size ? `Only ${changed.size} of ${keys.size} ${keys.size === 1 ? "key moves" : "keys move"}: ${[...changed].join(", ")}. The rest stay where they were.` : "No keys had to move.",
        item.op === "add_server" ? 2 : 3,
        Object.fromEntries([...changed].map((key) => [keys.get(key)!, Tone.WARN])),
        changed
      );
    }
    return { owners: Object.fromEntries(assignment()), moved };
  },
});

const SKIP_VERBS: Record<string, Verb> = {
  insert: { label: "Insert", value: "number" },
  find: { label: "Find", value: "number" },
  delete: { label: "Delete", value: "number" },
};

const MAX_LEVEL = 4;

export const level_of = (key: number) => {
  let bits = hash_string(String(key), 0x51ed);
  let level = 1;
  while (level < MAX_LEVEL && bits & 1) {
    level++;
    bits >>>= 1;
  }
  return level;
};

const skip = define({
  intro:
    "A skip list is a sorted linked list with express lanes. Each node also appears on higher levels with probability ½ per level (a coin flip, here a fixed hash so runs repeat). A search starts on the top lane, runs right while the next key is smaller, then drops down. That gives O(log n) expected time with only simple linked lists.",
  use: "Ordered maps that are easy to make concurrent: Redis sorted sets, LevelDB and RocksDB memtables.",
  traits: ["Randomised", "Ordered", "O(log n) expected"],
  pseudocode: [
    "search(k): start at the top level of the head",
    "  while next.key < k: move right",
    "  drop down a level; repeat until level 1",
    "insert(k): flip coins for its height; link it in on each level where the search dropped",
    "delete(k): unlink it on every level it's on",
  ],
  input: ops_spec({
    verbs: SKIP_VERBS,
    sample: [...[30, 10, 50, 20, 70, 40, 60, 80, 25].map((key) => op("insert", key)), op("find", 60), op("delete", 50), op("find", 55)],
    random: () => [...Array.from({ length: 9 }, () => op("insert", random_int(1, 99))), op("find", random_int(1, 99))],
  }),
  operations: ops_operations(SKIP_VERBS),
  *run(ops: Op[]) {
    const keys: number[] = [];
    let comparisons = 0;
    const found: boolean[] = [];
    const height = new Map<number, number>();
    const view = (marks: Map<string, Tone> = new Map()): View => {
      const levels = Array.from({ length: MAX_LEVEL }, (_, i) => MAX_LEVEL - i);
      return grid({
        title: "levels",
        row_labels: levels.map((level) => `L${level}`),
        col_labels: ["head", ...keys.map(String)],
        rows: levels.map((level) => [
          { text: "−∞", tone: marks.get(`${level}:head`) ?? Tone.MUTED },
          ...keys.map((key): Cell => (height.get(key)! >= level ? { text: String(key), tone: marks.get(`${level}:${key}`) } : { text: "", tone: undefined })),
        ]),
      });
    };
    const frame = (note: string, line: number, marks: Map<string, Tone> = new Map()): Step => ({ views: [view(marks)], line, note, counters: { comparisons, keys: keys.length } });
    function* search(k: number, line: number): Generator<Step, boolean> {
      const marks = new Map<string, Tone>();
      let at: number | "head" = "head";
      for (let level = MAX_LEVEL; level >= 1; level--) {
        marks.set(`${level}:${at}`, Tone.MARK);
        for (;;) {
          const start: number = at === "head" ? -1 : keys.indexOf(at);
          const next = keys.slice(start + 1).find((key) => height.get(key)! >= level);
          if (next === undefined) {
            yield frame(`Level ${level}: nothing further right. Drop down.`, 2, new Map(marks));
            break;
          }
          comparisons++;
          if (next < k) {
            at = next;
            marks.set(`${level}:${next}`, Tone.MARK);
            yield frame(`Level ${level}: ${next} < ${k}, move right.`, 1, new Map([...marks, [`${level}:${next}`, Tone.ACTIVE]]));
            continue;
          }
          if (next === k) {
            marks.set(`${level}:${next}`, Tone.DONE);
            yield frame(`Level ${level}: found ${k}.`, line, new Map(marks));
            return true;
          }
          yield frame(`Level ${level}: ${next} > ${k}. Drop down.`, 2, new Map([...marks, [`${level}:${next}`, Tone.COMPARE]]));
          break;
        }
      }
      return false;
    }
    yield frame("An empty skip list: just the head.", -1);
    for (const item of ops) {
      const k = Number(item.value);
      const present = yield* search(k, item.op === "find" ? 0 : 3);
      if (item.op === "find") {
        found.push(present);
        if (!present) yield frame(`${k} isn't in the list.`, 2);
      } else if (item.op === "insert") {
        if (present) {
          yield frame(`${k} is already there.`, 3);
          continue;
        }
        height.set(k, level_of(k));
        keys.push(k);
        keys.sort((a, b) => a - b);
        const marks = new Map(Array.from({ length: height.get(k)! }, (_, i) => [`${i + 1}:${k}`, Tone.WARN] as [string, Tone]));
        yield frame(`The coins give ${k} height ${height.get(k)}: link it in on ${height.get(k) === 1 ? "level 1" : `levels 1 to ${height.get(k)}`}.`, 3, marks);
      } else {
        if (!present) {
          yield frame(`${k} isn't in the list.`, 4);
          continue;
        }
        yield frame(`Unlink ${k} on all ${height.get(k)} of its levels.`, 4, new Map(Array.from({ length: height.get(k)! }, (_, i) => [`${i + 1}:${k}`, Tone.BAD] as [string, Tone])));
        keys.splice(keys.indexOf(k), 1);
        height.delete(k);
      }
    }
    return { keys, found };
  },
});

export default { hash_table, bloom, consistent, skip };
