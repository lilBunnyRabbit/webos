import { z } from "zod";
import { define, type Definition } from "../../engine/definition";
import { InputError, InputKind, numbers, random_int, type InputSpec } from "../../engine/inputs";
import { grid, Tone, type Cell, type Step, type View } from "../../engine/step";

export interface Process {
  name: string;
  arrival: number;
  burst: number;
  priority: number;
}

function process_spec(sample: Process[]): InputSpec<Process[]> {
  const check = (list: Process[]) => {
    if (list.length === 0 || list.length > 8) throw new InputError("Between 1 and 8 processes.");
    if (new Set(list.map((p) => p.name)).size !== list.length) throw new InputError("Give every process its own name.");
    if (list.some((p) => p.arrival < 0 || p.arrival > 30 || p.burst < 1 || p.burst > 12 || p.priority < 0 || p.priority > 9)) throw new InputError("Arrival 0–30, burst 1–12, priority 0–9.");
    return list;
  };
  return {
    kind: InputKind.TEXT,
    hint: "Processes as name arrival burst [priority]: A 0 5 2, B 1 3 1",
    schema: z.array(z.object({ name: z.string().min(1).max(3), arrival: z.number().int(), burst: z.number().int(), priority: z.number().int() })) as z.ZodType<Process[]>,
    parse: (text) =>
      check(
        text
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [name, ...rest] = part.split(/\s+/);
            const values = rest.map(Number);
            if (!/^[A-Za-z0-9]{1,3}$/.test(name ?? "") || values.length < 2 || values.length > 3 || values.some((v) => !Number.isInteger(v))) throw new InputError(`Can't read “${part}”: write a name, arrival time, burst time and an optional priority.`);
            return { name, arrival: values[0], burst: values[1], priority: values[2] ?? 0 };
          })
      ),
    format: (list) => list.map((p) => `${p.name} ${p.arrival} ${p.burst} ${p.priority}`).join(", "),
    random: () => "ABCDE".split("").map((name, i) => ({ name, arrival: i === 0 ? 0 : random_int(0, 8), burst: random_int(1, 7), priority: random_int(0, 4) })),
    sample,
  };
}

export interface Schedule {
  timeline: (string | null)[];
  finish: Record<string, number>;
  waiting: Record<string, number>;
}

const scheduling = define({
  intro:
    "The CPU runs one process at a time, so the scheduler decides who goes next. First come, first served runs them in arrival order; shortest job first picks the quickest one waiting (best average wait, but long jobs can starve); priority picks the most important; round robin gives everyone a short slice (the quantum) in turn, which keeps things responsive.",
  use: "Every operating system's scheduler, print and job queues, and anywhere you trade throughput against responsiveness.",
  traits: ["Gantt chart", "Waiting and turnaround time"],
  pseudocode: [
    "each time unit: add processes that have arrived to the ready queue",
    "if nothing is running, pick from the ready queue:",
    "  FCFS: the earliest arrival · SJF: the shortest burst · priority: the lowest number",
    "  round robin: the front of the queue, for at most one quantum",
    "run it for one unit; finished: record its finish time",
    "waiting = finish − arrival − burst",
  ],
  input: process_spec([
    { name: "A", arrival: 0, burst: 6, priority: 3 },
    { name: "B", arrival: 1, burst: 3, priority: 1 },
    { name: "C", arrival: 2, burst: 8, priority: 4 },
    { name: "D", arrival: 3, burst: 2, priority: 2 },
  ]),
  params: [
    {
      id: "policy",
      label: "Policy",
      kind: "choice",
      choices: [
        { value: "fcfs", label: "First come, first served" },
        { value: "sjf", label: "Shortest job first" },
        { value: "priority", label: "Priority" },
        { value: "rr", label: "Round robin" },
      ],
      default: "fcfs",
    },
    { id: "quantum", label: "Quantum", kind: "number", min: 1, max: 6, default: 2 },
  ],
  *run(list: Process[], params): Generator<Step, Schedule> {
    const policy = String(params.policy ?? "fcfs");
    const quantum = Number(params.quantum ?? 2);
    const left = new Map(list.map((p) => [p.name, p.burst]));
    const finish: Record<string, number> = {};
    const timeline: (string | null)[] = [];
    const ready: string[] = [];
    const arrived = new Set<string>();
    let running: string | null = null;
    let slice = 0;
    const by_name = new Map(list.map((p) => [p.name, p]));
    const total = list.reduce((sum, p) => sum + p.burst, 0) + Math.max(...list.map((p) => p.arrival));
    const gantt = (time: number): View =>
      grid({
        title: "Gantt chart",
        board: true,
        row_labels: list.map((p) => p.name),
        col_labels: timeline.map((_, t) => String(t)),
        rows: list.map((p) =>
          timeline.map((who, t): Cell => {
            if (who === p.name) return { text: "", tone: t === time ? Tone.ACTIVE : Tone.DONE };
            if (t < p.arrival) return { text: "", tone: Tone.MUTED };
            if (finish[p.name] !== undefined && t >= finish[p.name]) return { text: "", tone: Tone.MUTED };
            return { text: "", tone: Tone.MARK };
          })
        ),
      });
    const average = (values: number[]) => (values.length ? (values.reduce((s, v) => s + v, 0) / values.length).toFixed(2) : "–");
    const frame = (note: string, line: number, time: number): Step => {
      const done = list.filter((p) => finish[p.name] !== undefined);
      return {
        views: [gantt(time), { kind: "chain", title: "ready queue", items: ready.map((name) => ({ text: `${name} (${left.get(name)})` })) }],
        line,
        note,
        counters: { time: timeline.length, finished: `${done.length}/${list.length}`, "avg waiting": average(done.map((p) => finish[p.name] - p.arrival - p.burst)), "avg turnaround": average(done.map((p) => finish[p.name] - p.arrival)) },
      };
    };
    const pick = (): string | null => {
      if (ready.length === 0) return null;
      let index = 0;
      if (policy === "sjf") index = ready.reduce((best, name, i) => (left.get(name)! < left.get(ready[best])! ? i : best), 0);
      if (policy === "priority") index = ready.reduce((best, name, i) => (by_name.get(name)!.priority < by_name.get(ready[best])!.priority ? i : best), 0);
      return ready.splice(index, 1)[0];
    };
    for (let time = 0; Object.keys(finish).length < list.length && time <= total + 1; time++) {
      const arrivals = list.filter((p) => p.arrival === time && !arrived.has(p.name));
      for (const p of arrivals) {
        arrived.add(p.name);
        ready.push(p.name);
      }
      if (running && policy === "rr" && slice >= quantum && ready.length) {
        ready.push(running);
        const was = running;
        running = null;
        yield frame(`${was} used its quantum of ${quantum}: back of the queue.`, 3, time);
      }
      if (!running) {
        running = pick();
        slice = 0;
        if (running) yield frame(`t = ${time}: ${arrivals.length ? `${arrivals.map((p) => p.name).join(", ")} arrived. ` : ""}Pick ${running}${policy === "sjf" ? ` (shortest, ${left.get(running)} left)` : policy === "priority" ? ` (priority ${by_name.get(running)!.priority})` : ""}.`, policy === "rr" ? 3 : 2, time - 1);
      }
      timeline.push(running);
      if (!running) {
        yield frame(`t = ${time}: nothing is ready; the CPU idles.`, 1, time);
        continue;
      }
      left.set(running, left.get(running)! - 1);
      slice++;
      if (left.get(running) === 0) {
        finish[running] = time + 1;
        yield frame(`${running} finishes at ${time + 1}: it waited ${time + 1 - by_name.get(running)!.arrival - by_name.get(running)!.burst}.`, 4, time);
        running = null;
      } else yield frame(`t = ${time}: run ${running} (${left.get(running)} left).`, 4, time);
    }
    const waiting = Object.fromEntries(list.map((p) => [p.name, finish[p.name] - p.arrival - p.burst]));
    yield frame(`All done at ${timeline.length}. Average waiting ${average(Object.values(waiting))}, try another policy to compare.`, 5, -1);
    return { timeline, finish, waiting };
  },
});

const page_replacement = define({
  intro:
    "Memory holds only a few pages at once. When a program needs a page that isn't loaded (a page fault), one loaded page has to go. FIFO evicts the oldest; LRU evicts the least recently used; Clock approximates LRU cheaply with a use bit and a sweeping hand; Optimal evicts the page needed furthest in the future, which no real system can know, but it's the benchmark.",
  use: "Operating system virtual memory, database buffer pools and CPU caches all make this choice millions of times a second.",
  traits: ["Page faults", "Compare policies"],
  pseudocode: [
    "for each page reference p:",
    "  p is in a frame: a hit (LRU: refresh it; Clock: set its use bit)",
    "  else a fault: if a frame is free, load p there",
    "  else evict: FIFO oldest · LRU least recent · Clock: skip use bits, clearing them · Optimal: used furthest ahead",
  ],
  input: numbers({ sample: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], max_count: 30, min: 0, max: 9, random_count: 18, hint: "Page references 0–9, comma separated" }),
  params: [
    {
      id: "policy",
      label: "Policy",
      kind: "choice",
      choices: [
        { value: "fifo", label: "FIFO" },
        { value: "lru", label: "LRU" },
        { value: "clock", label: "Clock" },
        { value: "optimal", label: "Optimal" },
      ],
      default: "lru",
    },
    { id: "frames", label: "Frames", kind: "number", min: 2, max: 6, default: 3 },
  ],
  *run(refs: number[], params): Generator<Step, { faults: number }> {
    const policy = String(params.policy ?? "lru");
    const n = Number(params.frames ?? 3);
    const frames: (number | null)[] = new Array(n).fill(null);
    const loaded_at: number[] = new Array(n).fill(0);
    const used_at: number[] = new Array(n).fill(0);
    const use_bit: boolean[] = new Array(n).fill(false);
    let hand = 0;
    let faults = 0;
    const columns: { frames: (number | null)[]; hit: boolean; changed: number }[] = [];
    const view = (active = -1): View =>
      grid({
        title: "frames over time",
        row_labels: [...frames.map((_, f) => `frame ${f + 1}`), ""],
        col_labels: refs.map(String),
        rows: [
          ...frames.map((_, f) => columns.map((col, t): Cell => ({ text: col.frames[f] === null ? "" : String(col.frames[f]), tone: t === active && col.changed === f ? (col.hit ? Tone.DONE : Tone.WARN) : col.changed === f && !col.hit ? Tone.MARK : undefined }))),
          columns.map((col) => ({ text: col.hit ? "hit" : "miss", tone: col.hit ? Tone.DONE : Tone.BAD })),
        ],
      });
    const frame = (note: string, line: number, t: number): Step => ({ views: [view(t)], line, note, counters: { faults, hits: columns.length - faults, "hit rate": columns.length ? `${Math.round(((columns.length - faults) / columns.length) * 100)}%` : "–" } });
    for (const [t, page] of refs.entries()) {
      const at = frames.indexOf(page);
      if (at >= 0) {
        used_at[at] = t;
        use_bit[at] = true;
        columns.push({ frames: [...frames], hit: true, changed: at });
        yield frame(`${page} is already loaded: a hit.`, 1, t);
        continue;
      }
      faults++;
      let slot = frames.indexOf(null);
      let reason = "a free frame";
      if (slot < 0) {
        if (policy === "fifo") {
          slot = loaded_at.indexOf(Math.min(...loaded_at));
          reason = `${frames[slot]}, loaded first`;
        } else if (policy === "lru") {
          slot = used_at.indexOf(Math.min(...used_at));
          reason = `${frames[slot]}, unused the longest`;
        } else if (policy === "clock") {
          while (use_bit[hand]) {
            use_bit[hand] = false;
            hand = (hand + 1) % n;
          }
          slot = hand;
          hand = (hand + 1) % n;
          reason = `${frames[slot]}, the first with a clear use bit`;
        } else {
          const next_use = frames.map((value) => {
            const ahead = refs.indexOf(value!, t + 1);
            return ahead === -1 ? Infinity : ahead;
          });
          slot = next_use.indexOf(Math.max(...next_use));
          reason = next_use[slot] === Infinity ? `${frames[slot]}, never needed again` : `${frames[slot]}, needed furthest ahead`;
        }
      }
      frames[slot] = page;
      loaded_at[slot] = t;
      used_at[slot] = t;
      use_bit[slot] = true;
      columns.push({ frames: [...frames], hit: false, changed: slot });
      yield frame(`${page} isn't loaded: a fault. Put it in ${reason === "a free frame" ? "a free frame" : `place of ${reason}`}.`, reason === "a free frame" ? 2 : 3, t);
    }
    yield frame(`${faults} faults in ${refs.length} references with ${n} frames. Switch the policy to compare.`, -1, -1);
    return { faults };
  },
});

const producer_consumer = define({
  intro:
    "A producer puts items into a fixed-size buffer and a consumer takes them out, both at their own pace. Two counting semaphores coordinate them: 'empty' counts free slots and 'full' counts filled ones. A producer waits when empty is 0 (the buffer is full); a consumer waits when full is 0. A mutex keeps them from touching the buffer at the same moment.",
  use: "Every pipeline between threads or processes: logging, video decoding, network packet queues, task queues in thread pools.",
  traits: ["Semaphores", "Bounded buffer", "Blocking"],
  pseudocode: [
    "producer: wait(empty); lock; put item at in; in ← (in + 1) mod n; unlock; signal(full)",
    "consumer: wait(full); lock; take item at out; out ← (out + 1) mod n; unlock; signal(empty)",
    "wait(s): if s = 0, block until someone signals s; then s ← s − 1",
    "signal(s): s ← s + 1, waking one blocked waiter",
  ],
  input: {
    kind: InputKind.TEXT,
    hint: "Who acts, in order: p for the producer, c for the consumer, like p p p c p c c",
    schema: z.array(z.enum(["p", "c"])).min(1).max(40) as z.ZodType<("p" | "c")[]>,
    parse: (text) => {
      const ops = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
      if (ops.length === 0 || ops.length > 40 || ops.some((op) => op !== "p" && op !== "c")) throw new InputError("Use p and c only, up to 40 of them.");
      return ops as ("p" | "c")[];
    },
    format: (ops) => ops.join(" "),
    random: () => Array.from({ length: 16 }, () => (Math.random() < 0.55 ? "p" : "c")),
    sample: ["p", "p", "p", "c", "p", "p", "p", "c", "c", "c", "c", "c", "c", "p"],
  } satisfies InputSpec<("p" | "c")[]>,
  params: [{ id: "size", label: "Buffer size", kind: "number", min: 2, max: 8, default: 4 }],
  *run(ops: ("p" | "c")[], params): Generator<Step, { produced: number; consumed: number; blocked: number }> {
    const n = Number(params.size ?? 4);
    const buffer: (number | null)[] = new Array(n).fill(null);
    let put = 0;
    let take = 0;
    let empty = n;
    let full = 0;
    let produced = 0;
    let consumed = 0;
    let blocked = 0;
    const waiting: ("p" | "c")[] = [];
    const log: string[] = [];
    const frame = (note: string, line: number, active?: number, tone?: Tone): Step => ({
      views: [
        { kind: "ring", title: "buffer", cells: buffer.map((value, i) => ({ text: value === null ? "" : String(value), tone: i === active ? tone : value === null ? Tone.MUTED : undefined })), pointers: [{ index: put, label: "in", tone: Tone.WARN }, { index: take, label: "out", tone: Tone.COMPARE }] },
        grid({ title: "semaphores", col_labels: ["empty", "full", "blocked"], rows: [[{ text: String(empty), tone: empty === 0 ? Tone.BAD : undefined }, { text: String(full), tone: full === 0 ? Tone.BAD : undefined }, { text: waiting.length ? waiting.map((w) => (w === "p" ? "producer" : "consumer")).join(", ") : "none" }]] }),
        { kind: "text", title: "log", lines: log.slice(-6).map((text) => ({ text })) },
      ],
      line,
      note,
      counters: { produced, consumed, "times blocked": blocked },
    });
    const produce = function* (): Generator<Step> {
      const item = ++produced;
      buffer[put] = item;
      const at = put;
      put = (put + 1) % n;
      empty--;
      full++;
      log.push(`produced ${item}`);
      yield frame(`The producer puts item ${item} in slot ${at}. empty ${empty}, full ${full}.`, 0, at, Tone.WARN);
    };
    const consume = function* (): Generator<Step> {
      const item = buffer[take]!;
      buffer[take] = null;
      const at = take;
      take = (take + 1) % n;
      full--;
      empty++;
      consumed++;
      log.push(`consumed ${item}`);
      yield frame(`The consumer takes item ${item} from slot ${at}. empty ${empty}, full ${full}.`, 1, at, Tone.DONE);
    };
    yield frame(`An empty buffer of ${n}: empty = ${n}, full = 0.`, -1);
    for (const op of ops) {
      if (op === "p") {
        if (empty === 0) {
          blocked++;
          if (!waiting.includes("p")) waiting.push("p");
          yield frame("The producer calls wait(empty), but empty is 0: the buffer is full, so it blocks.", 2);
          continue;
        }
        yield* produce();
        if (waiting.includes("c")) {
          waiting.splice(waiting.indexOf("c"), 1);
          yield frame("signal(full) wakes the blocked consumer.", 3);
          yield* consume();
        }
      } else {
        if (full === 0) {
          blocked++;
          if (!waiting.includes("c")) waiting.push("c");
          yield frame("The consumer calls wait(full), but full is 0: nothing to take, so it blocks.", 2);
          continue;
        }
        yield* consume();
        if (waiting.includes("p")) {
          waiting.splice(waiting.indexOf("p"), 1);
          yield frame("signal(empty) wakes the blocked producer.", 3);
          yield* produce();
        }
      }
    }
    yield frame(`Done: ${produced} produced, ${consumed} consumed, ${full} still in the buffer.`, -1);
    return { produced, consumed, blocked };
  },
});

export default {
  "cpu-scheduling": scheduling,
  "page-replacement": page_replacement,
  "producer-consumer": producer_consumer,
} as unknown as Record<string, Definition>;
