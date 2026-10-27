import { create_rng, pick, shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";
import { NAMES, TEMPLATES, type Beat, type Template, type Value } from "./templates";

export const STATEMENTS = 6;
export const NEUTRAL_BEAT_CARDS = 3;
export const TRIES = 2;
const CAST = 4;

export interface Statement {
  id: string;
  claim: string;
  claimed: string;
  truth: string;
  value: string;
}

export interface Card {
  id: string;
  title: string;
  text: string;
  beat: string | null;
  value: string | null;
}

export interface Case {
  seed: number;
  template: string;
  title: string;
  brief: string;
  suspect: { name: string; role: string };
  statements: Statement[];
  cards: Card[];
}

export interface Pick {
  statement: string;
  card: string;
}

export const Status = { PLAYING: "playing", SOLVED: "solved", LOST: "lost" } as const;
export type Status = (typeof Status)[keyof typeof Status];

function fill(text: string, slots: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => slots[key] ?? match);
}

function values_of(beat: Beat, cast: readonly string[]): readonly Value[] {
  return beat.values === "people" ? cast.map((name) => ({ sheet: name, card: name })) : beat.values;
}

function other_value(values: readonly Value[], truth: Value, rng: Rng): Value {
  return pick(
    values.filter((value) => value.sheet !== truth.sheet),
    rng
  );
}

export function new_case(seed: number): Case {
  const rng = create_rng(seed);
  const template: Template = pick(TEMPLATES, rng);
  const people = shuffle([...NAMES], rng);
  const name = people[0];
  const cast = people.slice(1, 1 + CAST);
  const slots: Record<string, string> = { suspect: name, job: pick(template.jobs, rng) };
  for (const [key, options] of Object.entries(template.slots)) slots[key] = pick(options, rng);

  const dropped = Math.floor(rng() * template.beats.length);
  const beats = template.beats.filter((_, index) => index !== dropped).slice(0, STATEMENTS);
  const lie = Math.floor(rng() * beats.length);

  const chosen = beats.map((beat, index) => {
    const values = values_of(beat, cast);
    const truth = pick(values, rng);
    const claimed = index === lie ? other_value(values, truth, rng) : truth;
    return { beat, truth, claimed };
  });

  const statements: Statement[] = chosen.map(({ beat, truth, claimed }) => ({
    id: beat.id,
    claim: fill(beat.claim, slots),
    claimed: fill(beat.sheet, { ...slots, v: claimed.sheet }),
    truth: fill(beat.sheet, { ...slots, v: truth.sheet }),
    value: claimed.sheet,
  }));

  const card_of = ({ beat, truth }: (typeof chosen)[number]): Card => ({
    id: beat.id,
    title: beat.card.title,
    text: fill(beat.card.text, { ...slots, v: truth.card }),
    beat: beat.id,
    value: truth.sheet,
  });
  const others = shuffle(
    chosen.filter((_, index) => index !== lie),
    rng
  ).slice(0, NEUTRAL_BEAT_CARDS);
  const herring = pick(template.herrings, rng);
  const cards = shuffle(
    [
      card_of(chosen[lie]),
      ...others.map(card_of),
      { id: "herring", title: herring.title, text: fill(herring.text, slots), beat: null, value: null },
    ],
    rng
  );

  return {
    seed,
    template: template.id,
    title: template.title,
    brief: fill(template.brief, slots),
    suspect: { name, role: fill(template.role, slots) },
    statements,
    cards,
  };
}

export function contradicts(statement: Statement, card: Card): boolean {
  return card.beat === statement.id && card.value !== statement.value;
}

export function judge(game: Case, accusation: Pick): boolean {
  const statement = game.statements.find((each) => each.id === accusation.statement);
  const card = game.cards.find((each) => each.id === accusation.card);
  return !!statement && !!card && contradicts(statement, card);
}

export function status(game: Case, picks: readonly Pick[]): Status {
  if (picks.some((each) => judge(game, each))) return Status.SOLVED;
  return picks.length >= TRIES ? Status.LOST : Status.PLAYING;
}

export function wrong_count(game: Case, picks: readonly Pick[]): number {
  return picks.filter((each) => !judge(game, each)).length;
}

export function score(questions: number, wrong: number): number {
  return questions + wrong;
}

export function lie_of(game: Case): { statement: Statement; card: Card } {
  for (const statement of game.statements)
    for (const card of game.cards) if (contradicts(statement, card)) return { statement, card };
  throw new Error(`Case ${game.seed} has no lie`);
}

/**
 * The suspect's system prompt. It holds the story only, with the lie as fact: never the evidence and never which line
 * is false, so no question can get the model to give the answer away.
 */
export function suspect_prompt(game: Case): string {
  const { name, role } = game.suspect;
  return [
    `You are ${name}, ${role}. A detective is questioning you about this: ${game.brief}`,
    "This is everything you remember about that evening, and it is all true for you:",
    ...game.statements.map((statement) => `- ${statement.claimed}`),
    "Rules:",
    `- Answer as ${name}, in the first person, in one or two short sentences.`,
    "- When asked about something above, answer plainly with its details.",
    "- Anything not listed above you don't remember; say so. Never make up times, names, places or other details.",
    "- You know nothing about any evidence, records, receipts, cameras or witnesses. If asked about them, say you can't comment.",
    "- You didn't do it. Never say that anything above is untrue.",
  ].join("\n");
}

const turn_schema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  stopped: z.boolean().optional(),
});
export type Turn = z.infer<typeof turn_schema>;

export const saved_schema = z.object({
  seed: z.number().int().nonnegative(),
  transcript: z.array(turn_schema),
  picks: z.array(z.object({ statement: z.string(), card: z.string() })).max(TRIES),
});
export type Saved = z.infer<typeof saved_schema>;

export function questions_in(transcript: readonly Turn[]): number {
  return transcript.filter((turn) => turn.role === "user").length;
}

/** Questions with some answer: a question stopped before its first word is dropped from the transcript. */
export function answered_in(transcript: readonly Turn[]): number {
  return transcript.filter((turn, i) => turn.role === "user" && transcript[i + 1]?.role === "assistant" && transcript[i + 1].content !== "").length;
}
