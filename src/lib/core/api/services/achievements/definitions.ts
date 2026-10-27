import type { AppId } from "../apps/type";
import type { Achievement } from "./type";

export type Definitions = Record<AppId, Achievement[]>;

/** Written by the build beside the catalogue, which carries only each app's count (ADR-078). */
export const DEFINITIONS_URL = "store/achievements.json";

const is_achievement = (value: unknown): value is Achievement => {
  const def = value as Partial<Achievement> | null;
  return typeof def?.id === "string" && typeof def.title === "string" && typeof def.text === "string" && (def.goal === undefined || typeof def.goal === "number");
};

export function parse_definitions(value: unknown): Definitions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Definitions = {};
  for (const [id, list] of Object.entries(value)) if (Array.isArray(list)) out[id] = list.filter(is_achievement);
  return out;
}

export async function fetch_definitions(base: string = import.meta.env.BASE_URL): Promise<Definitions | null> {
  // No build under `bun dev` and in tests: the manifests answer, and the glob never reaches the bundle.
  if (import.meta.env.DEV) {
    const { apps } = await import("$lib/apps");
    return Object.fromEntries(apps.flatMap((manifest) => (manifest.achievements?.length ? [[manifest.id, manifest.achievements]] : [])));
  }
  try {
    const response = await fetch(`${base}${DEFINITIONS_URL}`, { cache: "no-cache" });
    return response.ok ? parse_definitions(await response.json()) : null;
  } catch {
    return null;
  }
}
