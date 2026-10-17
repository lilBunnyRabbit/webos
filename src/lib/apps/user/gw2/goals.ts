import { z } from "zod";
import type { Character, Slot } from "./api";

export const GoalSchema = z.object({
  id: z.string(),
  item_id: z.number().int().positive(),
  name: z.string(),
  icon: z.string(),
  target: z.number().int().min(1),
});
export type Goal = z.infer<typeof GoalSchema>;

export const GoalsSchema = z.array(GoalSchema);

export const MAX_TARGET = 1_000_000;

export interface Holding {
  label: string;
  counts: Map<number, number>;
}

export interface GoalProgress {
  owned: number;
  fraction: number;
  done: boolean;
  sources: { label: string; count: number }[];
}

export function tally(slots: Iterable<Slot | null>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const slot of slots) {
    if (!slot || slot.count <= 0) continue;
    counts.set(slot.id, (counts.get(slot.id) ?? 0) + slot.count);
  }
  return counts;
}

export function character_slots(character: Character): (Slot | null)[] {
  return (character.bags ?? []).flatMap((bag) => bag?.inventory ?? []);
}

export function goal_progress(holdings: readonly Holding[], goal: Pick<Goal, "item_id" | "target">): GoalProgress {
  const sources = holdings
    .map((holding) => ({ label: holding.label, count: holding.counts.get(goal.item_id) ?? 0 }))
    .filter((source) => source.count > 0);
  const owned = sources.reduce((sum, source) => sum + source.count, 0);
  return { owned, fraction: Math.min(1, owned / goal.target), done: owned >= goal.target, sources };
}

export function owned_ids(holdings: readonly Holding[]): Set<number> {
  return new Set(holdings.flatMap((holding) => [...holding.counts.keys()]));
}

export function clamp_target(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_TARGET, Math.max(1, Math.round(value))) : 1;
}

export function order_goals<T extends { progress: GoalProgress }>(goals: readonly T[]): T[] {
  return [...goals].sort((a, b) => Number(a.progress.done) - Number(b.progress.done) || (a.progress.done ? 0 : b.progress.fraction - a.progress.fraction));
}
