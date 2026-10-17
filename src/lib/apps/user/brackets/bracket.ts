import { z } from "zod";
import { PATHS } from "$lib/core/api/services/files/hierarchy";

export const APP_ID = "brackets";
export const EXTENSION = ".bracket";
export const BRACKETS_DIR = PATHS.documents;
export const BRACKET_VERSION = 1;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 64;
export const MAX_ROUND_ROBIN = 32;
export const MAX_NAME = 60;
export const MAX_RACES = 48;
export const MAX_RACE_SIZE = 24;

export const FormatKind = {
  SINGLE: "single",
  DOUBLE: "double",
  ROUND_ROBIN: "round_robin",
  CUP: "cup",
} as const;
export type FormatKind = (typeof FormatKind)[keyof typeof FormatKind];

export const FORMAT_LABELS: Record<FormatKind, string> = {
  single: "Single elimination",
  double: "Double elimination",
  round_robin: "Round robin",
  cup: "Race cup",
};

/** Mario Kart 8's table for 12 racers; a race with fewer players takes the top of it. */
export const DEFAULT_CUP_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const count = z.number().int().min(0).max(1000);

const SingleSchema = z.object({ kind: z.literal(FormatKind.SINGLE), third_place: z.boolean() });
const DoubleSchema = z.object({ kind: z.literal(FormatKind.DOUBLE), reset: z.boolean() });
const RoundRobinSchema = z.object({
  kind: z.literal(FormatKind.ROUND_ROBIN),
  legs: z.union([z.literal(1), z.literal(2)]),
  win: count,
  draw: count,
  loss: count,
});
const CupSchema = z.object({
  kind: z.literal(FormatKind.CUP),
  races: z.number().int().min(1).max(MAX_RACES),
  points: z.array(count).min(1).max(MAX_RACE_SIZE),
  race_size: z.number().int().min(MIN_PLAYERS).max(MAX_RACE_SIZE),
  advance: z.number().int().min(0).max(MAX_RACE_SIZE),
});

export const FormatSchema = z.discriminatedUnion("kind", [SingleSchema, DoubleSchema, RoundRobinSchema, CupSchema]);
export type Format = z.infer<typeof FormatSchema>;
export type SingleFormat = z.infer<typeof SingleSchema>;
export type DoubleFormat = z.infer<typeof DoubleSchema>;
export type RoundRobinFormat = z.infer<typeof RoundRobinSchema>;
export type CupFormat = z.infer<typeof CupSchema>;

export const PlayerSchema = z.object({ id: z.string().min(1).max(32), name: z.string().trim().min(1).max(MAX_NAME) });
export type Player = z.infer<typeof PlayerSchema>;

export const MatchResultSchema = z.object({
  kind: z.literal("match"),
  match: z.string().min(1).max(32),
  /** `null` is a draw (round robin only). */
  winner: z.string().nullable(),
  score: z.tuple([count, count]).optional(),
});
export type MatchResult = z.infer<typeof MatchResultSchema>;

export const CupStage = { GROUPS: "groups", FINAL: "final" } as const;
export type CupStage = (typeof CupStage)[keyof typeof CupStage];

export const RaceResultSchema = z.object({
  kind: z.literal("race"),
  stage: z.enum(CupStage),
  group: z.number().int().min(0),
  race: z.number().int().min(0),
  order: z.array(z.string()),
});
export type RaceResult = z.infer<typeof RaceResultSchema>;

export const ResultSchema = z.discriminatedUnion("kind", [MatchResultSchema, RaceResultSchema]);
export type Result = z.infer<typeof ResultSchema>;

// Results are a log in entry order; the bracket is derived from it, so Undo drops the last entry.
export const BracketSchema = z
  .object({
    version: z.literal(BRACKET_VERSION),
    name: z.string().trim().min(1).max(MAX_NAME),
    created: z.number(),
    players: z.array(PlayerSchema).min(MIN_PLAYERS).max(MAX_PLAYERS),
    format: FormatSchema,
    results: z.array(ResultSchema),
  })
  .refine((bracket) => new Set(bracket.players.map((player) => player.id)).size === bracket.players.length, {
    message: "Player ids must be unique",
  });
export type Bracket = z.infer<typeof BracketSchema>;

export const BracketFileSchema = BracketSchema.nullable();

export function default_format(kind: FormatKind, players: number): Format {
  switch (kind) {
    case FormatKind.SINGLE:
      return { kind, third_place: false };
    case FormatKind.DOUBLE:
      return { kind, reset: true };
    case FormatKind.ROUND_ROBIN:
      return { kind, legs: 1, win: 3, draw: 1, loss: 0 };
    case FormatKind.CUP: {
      const race_size = Math.min(Math.max(players, MIN_PLAYERS), 12);
      return { kind, races: 4, points: DEFAULT_CUP_POINTS.slice(0, race_size), race_size, advance: default_advance(players, race_size) };
    }
  }
}

export function group_count(players: number, race_size: number): number {
  return Math.max(1, Math.ceil(players / race_size));
}

export function default_advance(players: number, race_size: number): number {
  const groups = group_count(players, race_size);
  if (groups < 2) return 0;
  return Math.max(1, Math.min(Math.floor(players / groups), Math.floor(race_size / groups)));
}

export function parse_names(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().slice(0, MAX_NAME))
    .filter((line) => line.length > 0);
}

export function parse_points(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .filter((part) => part.length > 0)
    .map((part) => Math.max(0, Math.min(1000, Math.round(Number(part)))))
    .filter((value) => Number.isFinite(value));
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function max_players(kind: FormatKind): number {
  return kind === FormatKind.ROUND_ROBIN ? MAX_ROUND_ROBIN : MAX_PLAYERS;
}

export function create_bracket(name: string, names: readonly string[], format: Format, now = Date.now()): Bracket {
  return {
    version: BRACKET_VERSION,
    name: name.trim().slice(0, MAX_NAME) || "Bracket",
    created: now,
    players: names.map((player, index) => ({ id: `p${index + 1}`, name: player })),
    format,
    results: [],
  };
}

export function serialize_bracket(bracket: Bracket): string {
  return JSON.stringify(bracket, null, 2) + "\n";
}

export function file_name_for(name: string): string {
  const stem = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Bracket";
  return `${stem}${EXTENSION}`;
}

export function is_bracket_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function player_names(bracket: Pick<Bracket, "players">): Map<string, string> {
  return new Map(bracket.players.map((player) => [player.id, player.name]));
}
