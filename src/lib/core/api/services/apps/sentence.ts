import { z } from "zod";
import type { AiMessage, AiService } from "../ai/type";
import { APP_CATEGORY_LABELS } from "./search";
import type { AppListing } from "./type";

const STOP_WORDS = new Set(
  (
    "a an the to of for in on at by with from and or me my i im want need that which allows allow lets let tool tools app apps " +
    "application something thing some like can could would how do does make makes making create help please is are be it this way"
  ).split(" ")
);

const Field = { NAME: "name", KEYWORDS: "keywords", DESCRIPTION: "description", PITCH: "pitch" } as const;
type Field = (typeof Field)[keyof typeof Field];

const WEIGHTS: Record<Field, number> = { name: 6, keywords: 3, description: 2, pitch: 1 };
const FIELDS = Object.keys(WEIGHTS) as Field[];

const PREFIX_MIN = 3;
const CUTOFF = 0.4;
const K1 = 1.2;
const B = 0.75;

const words_of = (text: string) =>
  text
    .toLowerCase()
    .replaceAll("'", "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Crude English stemming: both sides go through it, so it only has to be consistent. */
export function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ings|ing|ers|er|ed|es|s)$/, "") : word;
}

const joined = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const with_pairs = (words: string[]) => [...words, ...words.slice(1).map((word, index) => words[index] + word)];

interface Doc<T> {
  app: T;
  fields: Record<Field, string[]>;
}

export interface SentenceIndex<T extends AppListing = AppListing> {
  docs: Doc<T>[];
  frequency: Map<string, number>;
  average: Record<Field, number>;
}

export function build_sentence_index<T extends AppListing>(apps: readonly T[]): SentenceIndex<T> {
  const docs = apps.map((app) => {
    const keywords = [app.id, ...(app.keywords ?? [])];
    const pitch = app.pitch ? `${app.pitch.problem} ${app.pitch.solution}` : "";
    // "pixel art" is also "pixelart", so a query written either way finds it.
    const fields: Record<Field, string[]> = {
      name: with_pairs(words_of(app.name)).map(stem),
      keywords: [...keywords.flatMap(words_of), ...keywords.map(joined)].map(stem),
      description: with_pairs(words_of(app.description ?? "")).map(stem),
      pitch: [...with_pairs(words_of(pitch)), ...words_of(APP_CATEGORY_LABELS[app.category])].map(stem),
    };
    return { app, fields };
  });
  const frequency = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(FIELDS.flatMap((field) => doc.fields[field]))) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  }
  const average = Object.fromEntries(
    FIELDS.map((field) => [field, docs.reduce((sum, doc) => sum + doc.fields[field].length, 0) / Math.max(docs.length, 1)])
  ) as Record<Field, number>;
  return { docs, frequency, average };
}

/** Neighbours the apps know as one word join ("to do" → "todo"); stop words drop out unless nothing else is left. */
export function query_terms(index: SentenceIndex, query: string): string[] {
  const words = words_of(query);
  const terms: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = i + 1 < words.length ? stem(words[i] + words[i + 1]) : null;
    if (pair && index.frequency.has(pair)) {
      terms.push(pair);
      i++;
    } else if (!STOP_WORDS.has(words[i])) terms.push(stem(words[i]));
  }
  return terms.length ? terms : words.map(stem);
}

function term_score<T extends AppListing>(index: SentenceIndex<T>, doc: Doc<T>, term: string): number {
  const holders = index.frequency.get(term) ?? 0;
  const rarity = Math.log(1 + (index.docs.length - holders + 0.5) / (holders + 0.5));
  let weight = 0;
  for (const field of FIELDS) {
    const words = doc.fields[field];
    const count = words.filter((word) => word === term || (term.length >= PREFIX_MIN && word.startsWith(term))).length;
    if (count === 0) continue;
    const length = words.length / (index.average[field] || 1);
    weight += (WEIGHTS[field] * (count * (K1 + 1))) / (count + K1 * (1 - B + B * length));
  }
  return rarity * weight;
}

/** Field-weighted BM25 scaled by the share of query words matched; under 40 % of the best score is cut. */
export function rank_sentence<T extends AppListing>(index: SentenceIndex<T>, query: string): T[] {
  const terms = query_terms(index, query);
  if (terms.length === 0) return [];
  const scored = index.docs
    .map((doc) => {
      let score = 0;
      let matched = 0;
      for (const term of terms) {
        const value = term_score(index, doc, term);
        if (value > 0) matched++;
        score += value;
      }
      return { app: doc.app, score: score * (matched / terms.length) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.app.name.localeCompare(b.app.name));
  const floor = (scored[0]?.score ?? 0) * CUTOFF;
  return scored.filter((entry) => entry.score >= floor).map((entry) => entry.app);
}

const MAX_KEYWORDS = 6;

const KeywordsSchema = z.object({ keywords: z.array(z.string()).max(MAX_KEYWORDS) });

export function suggest_messages(sentence: string): AiMessage[] {
  return [
    {
      role: "system",
      content: [
        "The user describes an app they want, in their own words.",
        `Answer with up to ${MAX_KEYWORDS} short lowercase English search keywords for that app: what it does, what kind of app it is, and common synonyms.`,
        "One or two words each. No app names you are unsure of.",
      ].join("\n"),
    },
    { role: "user", content: sentence },
  ];
}

/** On-device AI rewrites a sentence into search keywords, for `rank_sentence`. Throws whatever the model throws. */
export async function suggest_keywords(ai: AiService, sentence: string, signal?: AbortSignal): Promise<string[]> {
  const { keywords } = await ai.extract(suggest_messages(sentence), KeywordsSchema, { signal });
  return keywords.map((keyword) => keyword.trim()).filter(Boolean);
}
