import { z } from "zod";
import { crypto_source, sample, shuffle, type Checked, type RandomSource } from "./random";

export const ListMode = { PICK_ONE: "pick-one", PICK_MANY: "pick-many", SHUFFLE: "shuffle", TEAMS: "teams" } as const;
export type ListMode = (typeof ListMode)[keyof typeof ListMode];

export interface ListSettings {
  text: string;
  mode: ListMode;
  pick_count: number | null;
  team_count: number | null;
}

export type ListRequest =
  | { mode: typeof ListMode.PICK_ONE | typeof ListMode.SHUFFLE }
  | { mode: typeof ListMode.PICK_MANY | typeof ListMode.TEAMS; count: number };

export type ListResult = { kind: "items"; items: string[] } | { kind: "teams"; teams: string[][] };

export const DEFAULT_LIST_SETTINGS: ListSettings = { text: "", mode: ListMode.PICK_ONE, pick_count: 2, team_count: 2 };

export const list_settings_schema = z.object({
  text: z.string(),
  mode: z.enum([ListMode.PICK_ONE, ListMode.PICK_MANY, ListMode.SHUFFLE, ListMode.TEAMS]),
  pick_count: z.number().int().nullable(),
  team_count: z.number().int().nullable(),
});

export function parse_lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function split_teams<T>(items: readonly T[], team_count: number, source: RandomSource = crypto_source): T[][] {
  const count = Math.max(1, Math.floor(team_count));
  const teams: T[][] = Array.from({ length: count }, () => []);
  shuffle(items, source).forEach((item, index) => teams[index % count].push(item));
  return teams;
}

export function check_list(items: readonly string[], settings: ListSettings): Checked<ListRequest> {
  if (items.length === 0) return { ok: false, error: "Add some entries, one per line." };

  switch (settings.mode) {
    case ListMode.PICK_ONE:
    case ListMode.SHUFFLE:
      return { ok: true, value: { mode: settings.mode } };
    case ListMode.PICK_MANY: {
      const count = settings.pick_count;
      if (count === null || !Number.isInteger(count) || count < 1) return { ok: false, error: "Pick at least one entry." };
      if (count > items.length) return { ok: false, error: `There are only ${items.length} entries.` };
      return { ok: true, value: { mode: settings.mode, count } };
    }
    case ListMode.TEAMS: {
      const count = settings.team_count;
      if (count === null || !Number.isInteger(count) || count < 2) return { ok: false, error: "Make at least two teams." };
      if (count > items.length) return { ok: false, error: `${items.length} entries can't fill ${count} teams.` };
      return { ok: true, value: { mode: settings.mode, count } };
    }
  }
}

export function run_list(items: readonly string[], request: ListRequest, source: RandomSource = crypto_source): ListResult {
  switch (request.mode) {
    case ListMode.PICK_ONE:
      return { kind: "items", items: sample(items, 1, source) };
    case ListMode.SHUFFLE:
      return { kind: "items", items: shuffle(items, source) };
    case ListMode.PICK_MANY:
      return { kind: "items", items: sample(items, request.count, source) };
    case ListMode.TEAMS:
      return { kind: "teams", teams: split_teams(items, request.count, source) };
  }
}

export function format_list_result(result: ListResult): string {
  if (result.kind === "items") return result.items.join("\n");
  return result.teams.map((team, index) => `Team ${index + 1}\n${team.join("\n")}`).join("\n\n");
}
