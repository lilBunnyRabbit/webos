import { Tone, type Step, type View } from "../engine/step";

export const TONE_ORDER: Tone[] = [Tone.ACTIVE, Tone.COMPARE, Tone.WARN, Tone.MARK, Tone.DONE, Tone.BAD, Tone.MUTED];

export const TONE_LABEL: Record<Tone, string> = {
  [Tone.ACTIVE]: "Current",
  [Tone.COMPARE]: "Compared",
  [Tone.WARN]: "Changed",
  [Tone.MARK]: "In play",
  [Tone.DONE]: "Final",
  [Tone.BAD]: "Rejected",
  [Tone.MUTED]: "Out of play",
};

export const TONE_BG: Record<Tone, string> = {
  [Tone.ACTIVE]: "bg-info",
  [Tone.COMPARE]: "bg-secondary",
  [Tone.WARN]: "bg-warning",
  [Tone.MARK]: "bg-tertiary",
  [Tone.DONE]: "bg-success",
  [Tone.BAD]: "bg-error",
  [Tone.MUTED]: "bg-foreground/12",
};

export const TONE_TINT: Record<Tone, string> = {
  [Tone.ACTIVE]: "bg-info/15 ring-info",
  [Tone.COMPARE]: "bg-secondary/15 ring-secondary",
  [Tone.WARN]: "bg-warning/15 ring-warning",
  [Tone.MARK]: "bg-tertiary/15 ring-tertiary/70",
  [Tone.DONE]: "bg-success/15 ring-success/70",
  [Tone.BAD]: "bg-error/15 ring-error",
  [Tone.MUTED]: "bg-transparent ring-foreground/10 text-foreground/45",
};

export const TONE_FILL: Record<Tone, string> = {
  [Tone.ACTIVE]: "fill-info",
  [Tone.COMPARE]: "fill-secondary",
  [Tone.WARN]: "fill-warning",
  [Tone.MARK]: "fill-tertiary",
  [Tone.DONE]: "fill-success",
  [Tone.BAD]: "fill-error",
  [Tone.MUTED]: "fill-foreground/12",
};

export const TONE_STROKE: Record<Tone, string> = {
  [Tone.ACTIVE]: "stroke-info",
  [Tone.COMPARE]: "stroke-secondary",
  [Tone.WARN]: "stroke-warning",
  [Tone.MARK]: "stroke-tertiary",
  [Tone.DONE]: "stroke-success",
  [Tone.BAD]: "stroke-error",
  [Tone.MUTED]: "stroke-foreground/15",
};

export const TONE_TEXT: Record<Tone, string> = {
  [Tone.ACTIVE]: "text-info",
  [Tone.COMPARE]: "text-secondary",
  [Tone.WARN]: "text-warning",
  [Tone.MARK]: "text-tertiary",
  [Tone.DONE]: "text-success",
  [Tone.BAD]: "text-error",
  [Tone.MUTED]: "text-foreground/45",
};

function view_tones(view: View, into: Set<Tone>) {
  const add = (tone: Tone | undefined) => tone && into.add(tone);
  switch (view.kind) {
    case "bars":
      Object.values(view.tones ?? {}).forEach(add);
      break;
    case "tree": {
      const walk = (node: { tone?: Tone; children: unknown[] } | null) => {
        if (!node) return;
        add(node.tone);
        node.children.forEach((child) => walk(child as typeof node));
      };
      view.roots.forEach(walk);
      break;
    }
    case "graph":
      view.nodes.forEach((node) => add(node.tone));
      view.edges.forEach((edge) => add(edge.tone));
      break;
    case "grid":
      view.rows.forEach((row) => row.forEach((cell) => add(cell?.tone)));
      break;
    case "ring":
      view.cells.forEach((cell) => add(cell.tone));
      break;
    case "chain":
      view.items.forEach((cell) => add(cell.tone));
      break;
    case "points":
      view.points.forEach((point) => add(point.tone));
      view.segments?.forEach((segment) => add(segment.tone));
      break;
    case "text":
      view.lines.forEach((line) => add(line.tone));
      break;
  }
}

export function step_tones(step: Step | undefined): Tone[] {
  const found = new Set<Tone>();
  for (const view of step?.views ?? []) view_tones(view, found);
  return TONE_ORDER.filter((tone) => found.has(tone));
}
