import { z } from "zod";
import { define, type Definition } from "../../engine/definition";
import { points } from "../../engine/graph-input";
import { InputError, InputKind, random_int, type InputSpec } from "../../engine/inputs";
import { Tone, type Point, type PointsView, type Step } from "../../engine/step";

const SAMPLE: Point[] = [
  { x: 20, y: 30 },
  { x: 45, y: 15 },
  { x: 70, y: 25 },
  { x: 85, y: 50 },
  { x: 75, y: 80 },
  { x: 50, y: 88 },
  { x: 25, y: 75 },
  { x: 12, y: 50 },
  { x: 40, y: 45 },
  { x: 55, y: 55 },
  { x: 60, y: 35 },
  { x: 35, y: 65 },
];

export const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const label = (p: Point) => `(${p.x}, ${p.y})`;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function plane(all: Point[], marks: Map<Point, Tone>, extra: Partial<PointsView> = {}): PointsView {
  return { kind: "points", title: "plane", points: all.map((p) => ({ ...p, tone: marks.get(p) })), ...extra };
}

const graham = define({
  intro:
    "The convex hull is the rubber band around a set of points. Graham's scan starts from the lowest point, sorts the rest by angle around it, and walks them in that order with a stack. A cross product tells whether three points turn left or right; any point that would make a right turn is popped, since it's inside the band.",
  use: "Collision shapes in games, the outline of a cluster of map points, and the first step of many geometry algorithms.",
  traits: ["O(n log n)", "Cross products, no angles needed"],
  pseudocode: ["p0 ← the lowest point", "sort the others by angle around p0", "for each point p in that order:", "  while the last two on the stack and p don't turn left: pop", "  push p", "the stack is the hull"],
  input: points(SAMPLE),
  *run(input: Point[]): Generator<Step, { hull: Point[] }> {
    const all = input.map((p) => ({ ...p }));
    let checks = 0;
    const start = all.reduce((best, p) => (p.y > best.y || (p.y === best.y && p.x < best.x) ? p : best));
    const angle = (p: Point) => Math.atan2(start.y - p.y, p.x - start.x);
    const rest = all.filter((p) => p !== start).sort((a, b) => angle(a) - angle(b) || dist(start, a) - dist(start, b));
    const stack: Point[] = [start];
    const marks = new Map<Point, Tone>([[start, Tone.ACTIVE]]);
    const frame = (note: string, line: number, candidate?: Point): Step => ({
      views: [plane(all, new Map([...marks, ...stack.map((p) => [p, Tone.DONE] as [Point, Tone]), ...(candidate ? [[candidate, Tone.ACTIVE] as [Point, Tone]] : [])]), {
          segments: [...stack.slice(1).map((p, i) => ({ a: stack[i], b: p, tone: Tone.DONE as Tone })), ...(candidate ? [{ a: stack.at(-1)!, b: candidate, tone: Tone.COMPARE as Tone }] : [])],
        })],
      line,
      note,
      counters: { "on stack": stack.length, checks },
    });
    yield frame(`Start from the lowest point, ${label(start)}.`, 0);
    yield frame("Sort the other points by angle around it.", 1);
    for (const p of rest) {
      while (stack.length >= 2) {
        checks++;
        if (cross(stack.at(-2)!, stack.at(-1)!, p) < 0) break;
        const popped = stack.pop()!;
        marks.set(popped, Tone.MUTED);
        yield frame(`${label(stack.at(-1)!)} → ${label(popped)} → ${label(p)} doesn't turn left: ${label(popped)} is inside. Pop it.`, 3, p);
      }
      stack.push(p);
      yield frame(`Push ${label(p)}.`, 4, p);
    }
    yield { ...frame(`The hull has ${stack.length} corners.`, 5), views: [plane(all, new Map([...marks, ...stack.map((p) => [p, Tone.DONE] as [Point, Tone])]), { polygon: stack })] };
    return { hull: stack };
  },
});

const jarvis = define({
  intro:
    "The gift-wrapping (Jarvis march) algorithm starts at the leftmost point and repeatedly picks the next point so that every other point lies on the same side of the line to it, as if wrapping a string around the set. It costs O(n·h), where h is the number of hull corners: great when the hull is small.",
  use: "Hulls with few corners, and explaining what a convex hull is: it's the most direct algorithm.",
  traits: ["O(n·h)", "Output-sensitive"],
  pseudocode: ["p ← the leftmost point", "repeat:", "  candidate ← any other point", "  for each point q: if q is to the right of p → candidate: candidate ← q", "  add candidate to the hull; p ← candidate", "until p is back at the start"],
  input: points(SAMPLE),
  *run(input: Point[]): Generator<Step, { hull: Point[] }> {
    const all = input.map((p) => ({ ...p }));
    const start = all.reduce((best, p) => (p.x < best.x || (p.x === best.x && p.y < best.y) ? p : best));
    const hull: Point[] = [];
    let checks = 0;
    const frame = (note: string, line: number, current: Point, candidate?: Point, probe?: Point): Step => ({
      views: [
        plane(all, new Map<Point, Tone>([...hull.map((p) => [p, Tone.DONE] as [Point, Tone]), [current, Tone.ACTIVE], ...(candidate ? [[candidate, Tone.WARN] as [Point, Tone]] : []), ...(probe ? [[probe, Tone.COMPARE] as [Point, Tone]] : [])]), {
          segments: [...hull.slice(1).map((p, i) => ({ a: hull[i], b: p, tone: Tone.DONE })), ...(candidate ? [{ a: current, b: candidate, tone: Tone.WARN }] : []), ...(probe ? [{ a: current, b: probe, tone: Tone.COMPARE }] : [])],
        }),
      ],
      line,
      note,
      counters: { corners: hull.length, checks },
    });
    let p = start;
    do {
      hull.push(p);
      let candidate = all.find((q) => q !== p)!;
      yield frame(`From ${label(p)}, start with ${label(candidate)} as the next corner.`, 2, p, candidate);
      for (const q of all) {
        if (q === p || q === candidate) continue;
        checks++;
        const turn = cross(p, candidate, q);
        if (turn < 0 || (turn === 0 && dist(p, q) > dist(p, candidate))) {
          candidate = q;
          yield frame(`${label(q)} is further out: it becomes the candidate.`, 3, p, candidate, q);
        }
      }
      yield frame(`Every point is on one side of ${label(p)} → ${label(candidate)}: it's a hull edge.`, 4, p, candidate);
      p = candidate;
    } while (p !== start && hull.length <= all.length);
    yield { ...frame(`Back at the start: ${hull.length} corners.`, 5, start), views: [plane(all, new Map(hull.map((q) => [q, Tone.DONE] as [Point, Tone])), { polygon: hull })] };
    return { hull };
  },
});

const closest = define({
  intro:
    "Checking every pair costs O(n²). Divide and conquer does it in O(n log n): split the points by x into halves, solve each, and let d be the smaller answer. The closest pair across the split must lie in a strip of width 2d around it, and inside that strip, sorted by y, each point only needs comparing with the next few.",
  use: "Collision detection, clustering, and a classic example of divide and conquer beating brute force.",
  traits: ["Divide and conquer", "O(n log n)"],
  pseudocode: ["sort by x; solve(points):", "  3 points or fewer: compare every pair", "  split at the middle x; d ← min(solve(left), solve(right))", "  strip ← points within d of the split line, sorted by y", "  compare each strip point with the next points up to d higher", "return the closest pair found"],
  input: points(SAMPLE),
  *run(input: Point[]): Generator<Step, { distance: number }> {
    const all = input.map((p) => ({ ...p }));
    const sorted = [...all].sort((a, b) => a.x - b.x || a.y - b.y);
    let best: [Point, Point] = [sorted[0], sorted[1]];
    let best_d = dist(best[0], best[1]);
    let comparisons = 0;
    const frame = (note: string, line: number, marks: Map<Point, Tone> = new Map(), extra: Partial<PointsView> = {}): Step => ({
      views: [plane(all, new Map([...marks, [best[0], Tone.DONE], [best[1], Tone.DONE]]), { ...extra, segments: [...(extra.segments ?? []), { a: best[0], b: best[1], tone: Tone.DONE }] })],
      line,
      note,
      counters: { comparisons, best: best_d.toFixed(2) },
    });
    const consider = (a: Point, b: Point) => {
      comparisons++;
      const d = dist(a, b);
      if (d < best_d) {
        best_d = d;
        best = [a, b];
        return true;
      }
      return false;
    };
    function* solve(list: Point[]): Generator<Step> {
      if (list.length <= 3) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) consider(list[i], list[j]);
        yield frame(`${list.length} points: compare every pair. Best so far ${best_d.toFixed(2)}.`, 1, new Map(list.map((p) => [p, Tone.MARK] as [Point, Tone])));
        return;
      }
      const mid = Math.floor(list.length / 2);
      const split = (list[mid - 1].x + list[mid].x) / 2;
      yield frame(`Split ${list.length} points at x = ${split}.`, 2, new Map(list.map((p, i) => [p, i < mid ? Tone.MARK : Tone.COMPARE] as [Point, Tone])), { sweep: split });
      yield* solve(list.slice(0, mid));
      yield* solve(list.slice(mid));
      const strip = list.filter((p) => Math.abs(p.x - split) < best_d).sort((a, b) => a.y - b.y);
      yield frame(`${strip.length} points lie within ${best_d.toFixed(2)} of the split: check only those.`, 3, new Map(strip.map((p) => [p, Tone.ACTIVE] as [Point, Tone])), { sweep: split });
      for (let i = 0; i < strip.length; i++)
        for (let j = i + 1; j < strip.length && strip[j].y - strip[i].y < best_d; j++)
          if (consider(strip[i], strip[j])) yield frame(`Across the split: ${label(strip[i])} and ${label(strip[j])} are only ${best_d.toFixed(2)} apart.`, 4, new Map(strip.map((p) => [p, Tone.ACTIVE] as [Point, Tone])), { sweep: split });
    }
    yield* solve(sorted);
    yield frame(`Closest: ${label(best[0])} and ${label(best[1])}, ${best_d.toFixed(2)} apart, after ${comparisons} comparisons (all pairs would be ${(all.length * (all.length - 1)) / 2}).`, 5);
    return { distance: best_d };
  },
});

interface Segment {
  a: Point;
  b: Point;
}

const SEGMENTS: Segment[] = [
  { a: { x: 5, y: 20 }, b: { x: 60, y: 70 } },
  { a: { x: 15, y: 80 }, b: { x: 70, y: 15 } },
  { a: { x: 30, y: 40 }, b: { x: 95, y: 45 } },
  { a: { x: 50, y: 85 }, b: { x: 90, y: 60 } },
  { a: { x: 65, y: 10 }, b: { x: 80, y: 95 } },
  { a: { x: 10, y: 55 }, b: { x: 40, y: 58 } },
];

function segments_spec(sample: Segment[]): InputSpec<Segment[]> {
  const coordinate = z.number().min(0).max(100);
  return {
    kind: InputKind.TEXT,
    hint: "Segments as x1 y1 x2 y2 from 0 to 100, comma separated",
    schema: z.array(z.object({ a: z.object({ x: coordinate, y: coordinate }), b: z.object({ x: coordinate, y: coordinate }) })).min(2).max(16),
    parse: (text) => {
      const list = text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const values = part.split(/\s+/).map(Number);
          if (values.length !== 4 || values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) throw new InputError(`Can't read “${part}”: write x1 y1 x2 y2, each 0–100.`);
          return { a: { x: values[0], y: values[1] }, b: { x: values[2], y: values[3] } };
        });
      if (list.length < 2 || list.length > 16) throw new InputError("Between 2 and 16 segments.");
      return list;
    },
    format: (list) => list.map((s) => `${s.a.x} ${s.a.y} ${s.b.x} ${s.b.y}`).join(", "),
    random: () => Array.from({ length: 7 }, () => ({ a: { x: random_int(0, 100), y: random_int(0, 100) }, b: { x: random_int(0, 100), y: random_int(0, 100) } })),
    sample,
  };
}

export function intersect(s: Segment, t: Segment): Point | null {
  const d = (s.b.x - s.a.x) * (t.b.y - t.a.y) - (s.b.y - s.a.y) * (t.b.x - t.a.x);
  if (d === 0) return null;
  const u = ((t.a.x - s.a.x) * (t.b.y - t.a.y) - (t.a.y - s.a.y) * (t.b.x - t.a.x)) / d;
  const v = ((t.a.x - s.a.x) * (s.b.y - s.a.y) - (t.a.y - s.a.y) * (s.b.x - s.a.x)) / d;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { x: Math.round((s.a.x + u * (s.b.x - s.a.x)) * 10) / 10, y: Math.round((s.a.y + u * (s.b.y - s.a.y)) * 10) / 10 };
}

const sweep = define({
  intro:
    "Move a vertical line from left to right across the segments. Only segments the line currently crosses can intersect each other, so a segment is tested only against those 'active' ones when it starts, never against segments that ended earlier. On spread-out data that skips most pairs. (Bentley–Ottmann refines this by keeping the active ones sorted.)",
  use: "Finding crossings in maps and circuit layouts, polygon overlap, and the template for many plane-sweep algorithms.",
  traits: ["Plane sweep", "Events sorted by x"],
  pseudocode: ["events ← every segment's left and right end, sorted by x", "for each event:", "  a left end: test the segment against every active one, then make it active", "  a right end: remove the segment from the active set", "report every crossing found"],
  input: segments_spec(SEGMENTS),
  *run(input: Segment[]): Generator<Step, { crossings: Point[] }> {
    const list = input.map((s) => (s.a.x <= s.b.x ? s : { a: s.b, b: s.a }));
    const events = list.flatMap((s, i) => [
      { x: s.a.x, start: true, i },
      { x: s.b.x, start: false, i },
    ]);
    events.sort((p, q) => p.x - q.x || (p.start === q.start ? 0 : p.start ? -1 : 1));
    const active = new Set<number>();
    const found: Point[] = [];
    let tests = 0;
    const frame = (note: string, line: number, x?: number, current?: number, probe?: number): Step => ({
      views: [
        {
          kind: "points",
          title: "plane",
          points: [...list.flatMap((s) => [s.a, s.b]).map((p) => ({ ...p })), ...found.map((p) => ({ ...p, tone: Tone.DONE, label: "×" }))],
          segments: list.map((s, i) => ({ a: s.a, b: s.b, tone: i === current ? Tone.ACTIVE : i === probe ? Tone.COMPARE : active.has(i) ? Tone.MARK : undefined })),
          sweep: x,
        },
      ],
      line,
      note,
      counters: { active: active.size, tests, crossings: found.length, "all pairs": (list.length * (list.length - 1)) / 2 },
    });
    yield frame(`${events.length} events, sorted by x.`, 0);
    for (const event of events) {
      if (!event.start) {
        active.delete(event.i);
        yield frame(`x = ${event.x}: segment ${event.i + 1} ends. Remove it from the active set.`, 3, event.x, event.i);
        continue;
      }
      yield frame(`x = ${event.x}: segment ${event.i + 1} starts. Test it against the ${active.size} active ${active.size === 1 ? "segment" : "segments"}.`, 2, event.x, event.i);
      for (const j of active) {
        tests++;
        const hit = intersect(list[event.i], list[j]);
        if (hit) {
          found.push(hit);
          yield frame(`Segments ${event.i + 1} and ${j + 1} cross at (${hit.x}, ${hit.y}).`, 2, event.x, event.i, j);
        } else yield frame(`Segments ${event.i + 1} and ${j + 1} don't cross.`, 2, event.x, event.i, j);
      }
      active.add(event.i);
    }
    yield frame(`Done: ${found.length} ${found.length === 1 ? "crossing" : "crossings"} with ${tests} tests instead of ${(list.length * (list.length - 1)) / 2}.`, 4);
    return { crossings: found };
  },
});

export default {
  "graham-scan": graham,
  "jarvis-march": jarvis,
  "closest-pair": closest,
  "line-sweep": sweep,
} as unknown as Record<string, Definition>;
