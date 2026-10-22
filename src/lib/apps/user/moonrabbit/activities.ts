import { random_id } from "./crypto";

export interface ActivityDef {
  id: string;
  label: string;
  icon: string;
  hidden?: boolean;
}

export const ICON_NAMES = [
  "work",
  "exercise",
  "walk",
  "run",
  "friends",
  "family",
  "partner",
  "reading",
  "gaming",
  "cooking",
  "music",
  "movies",
  "chores",
  "learning",
  "relax",
  "travel",
  "shopping",
  "nature",
  "sick",
  "pet",
  "art",
  "coding",
  "coffee",
  "sleep",
  "sun",
  "star",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/** Ids are stable: entries store them, so a rename or a hide never touches an entry. */
export const DEFAULT_ACTIVITIES: ActivityDef[] = [
  { id: "work", label: "Work", icon: "work" },
  { id: "exercise", label: "Exercise", icon: "exercise" },
  { id: "walk", label: "Walk", icon: "walk" },
  { id: "friends", label: "Friends", icon: "friends" },
  { id: "family", label: "Family", icon: "family" },
  { id: "partner", label: "Partner", icon: "partner" },
  { id: "reading", label: "Reading", icon: "reading" },
  { id: "gaming", label: "Gaming", icon: "gaming" },
  { id: "cooking", label: "Cooking", icon: "cooking" },
  { id: "music", label: "Music", icon: "music" },
  { id: "movies", label: "Movies & TV", icon: "movies" },
  { id: "chores", label: "Chores", icon: "chores" },
  { id: "learning", label: "Learning", icon: "learning" },
  { id: "relax", label: "Relax", icon: "relax" },
  { id: "travel", label: "Travel", icon: "travel" },
];

/** A default added in a later version shows up in a journal that already stored its own list. */
export function activity_list(stored: readonly ActivityDef[] | undefined): ActivityDef[] {
  if (!stored) return DEFAULT_ACTIVITIES.map((activity) => ({ ...activity }));
  const known = new Set(stored.map((activity) => activity.id));
  return [...stored, ...DEFAULT_ACTIVITIES.filter((activity) => !known.has(activity.id))];
}

export function clean_activity_label(label: string): string | null {
  const clean = label.trim().replace(/\s+/g, " ").slice(0, 40);
  return clean || null;
}

export function add_activity(list: readonly ActivityDef[], label: string, icon: string): ActivityDef[] {
  const clean = clean_activity_label(label);
  if (!clean) return [...list];
  return [...list, { id: `c-${random_id().slice(0, 12)}`, label: clean, icon }];
}

export function update_activity(
  list: readonly ActivityDef[],
  id: string,
  change: Partial<Omit<ActivityDef, "id">>
): ActivityDef[] {
  return list.map((activity) => (activity.id === id ? { ...activity, ...change } : activity));
}

export function toggle_id(list: readonly string[] | undefined, id: string): string[] | undefined {
  const next = list?.includes(id) ? list.filter((item) => item !== id) : [...(list ?? []), id];
  return next.length ? next : undefined;
}
