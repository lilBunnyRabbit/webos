import { entry_for, Group } from "./catalog";
import type { Definition } from "./engine/definition";

type GroupModule = Promise<{ default: Record<string, Definition> }>;

const LOADERS: Record<Group, () => GroupModule> = {
  [Group.SORTING]: () => import("./groups/sorting"),
  [Group.TREES]: () => import("./groups/trees"),
};

const loaded: Partial<Record<Group, GroupModule>> = {};

export async function definition_for(id: string): Promise<Definition | null> {
  const entry = entry_for(id);
  if (!entry) return null;
  const group = await (loaded[entry.group] ??= LOADERS[entry.group]());
  return group.default[id] ?? null;
}
