import { z } from "zod";
import { create_rng, shuffle } from "$lib/core/utils/random";

// 0..51 as `suit * 13 + rank - 1`, so saves and keys stay plain numbers.
export type Card = number;

export const Suit = { SPADES: 0, HEARTS: 1, DIAMONDS: 2, CLUBS: 3 } as const;
export type Suit = (typeof Suit)[keyof typeof Suit];
export const SUITS: readonly Suit[] = [Suit.SPADES, Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS];
export const SUIT_NAMES: Record<Suit, string> = { 0: "spades", 1: "hearts", 2: "diamonds", 3: "clubs" };
export const RANK_LABELS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_NAMES = ["", "Ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King"];

export const DRAWS = [1, 3] as const;
export type Draw = (typeof DRAWS)[number];

export const suit_of = (card: Card): Suit => Math.floor(card / 13) as Suit;
export const rank_of = (card: Card): number => (card % 13) + 1;
export const is_red = (card: Card): boolean => suit_of(card) === Suit.HEARTS || suit_of(card) === Suit.DIAMONDS;
export const card_name = (card: Card): string => `${RANK_NAMES[rank_of(card)]} of ${SUIT_NAMES[suit_of(card)]}`;

export interface Column {
  cards: Card[];
  hidden: number;
}

export interface Game {
  draw: Draw;
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Column[];
  score: number;
  moves: number;
}

// `s` stock, `w` waste, `f0`–`f3` foundations by suit, `t0`–`t6` tableau columns: short because saves list every move.
export type PileId = "s" | "w" | `f${number}` | `t${number}`;

export const MoveKind = { DRAW: "draw", MOVE: "move" } as const;

export type Move = { kind: typeof MoveKind.DRAW } | { kind: typeof MoveKind.MOVE; from: PileId; to: PileId; count: number };

const pile_schema = z.string().regex(/^(?:s|w|f[0-3]|t[0-6])$/) as unknown as z.ZodType<PileId>;
export const move_schema: z.ZodType<Move> = z.union([
  z.object({ kind: z.literal(MoveKind.DRAW) }),
  z.object({ kind: z.literal(MoveKind.MOVE), from: pile_schema, to: pile_schema, count: z.number().int().min(1).max(13) }),
]);

export const Points = {
  WASTE_TO_TABLEAU: 5,
  TO_FOUNDATION: 10,
  TURN_OVER: 5,
  FOUNDATION_TO_TABLEAU: -15,
  RECYCLE_DRAW_ONE: -100,
} as const;

export function deal(seed: number, draw: Draw): Game {
  const deck = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    create_rng(seed)
  );
  const tableau: Column[] = Array.from({ length: 7 }, (_, i) => ({ cards: [], hidden: i }));
  for (let row = 0; row < 7; row++) {
    for (let col = row; col < 7; col++) tableau[col].cards.push(deck.pop()!);
  }
  return { draw, stock: deck, waste: [], foundations: [[], [], [], []], tableau, score: 0, moves: 0 };
}

export function pile(game: Game, id: PileId): Card[] {
  if (id === "s") return game.stock;
  if (id === "w") return game.waste;
  const index = Number(id.slice(1));
  return id[0] === "f" ? game.foundations[index] : game.tableau[index].cards;
}

const top = (cards: readonly Card[]): Card | undefined => cards[cards.length - 1];

export function fits_foundation(game: Game, card: Card): boolean {
  return game.foundations[suit_of(card)].length === rank_of(card) - 1;
}

export function fits_tableau(game: Game, card: Card, index: number): boolean {
  const target = top(game.tableau[index].cards);
  if (target === undefined) return rank_of(card) === 13;
  return rank_of(target) === rank_of(card) + 1 && is_red(target) !== is_red(card);
}

export function movable(game: Game, from: PileId): number {
  if (from === "s") return 0;
  if (from === "w" || from[0] === "f") return pile(game, from).length ? 1 : 0;
  const column = game.tableau[Number(from.slice(1))];
  return column.cards.length - column.hidden;
}

export function can_move(game: Game, from: PileId, to: PileId, count: number): boolean {
  if (from === to || count < 1 || count > movable(game, from) || to === "s" || to === "w") return false;
  const source = pile(game, from);
  const card = source[source.length - count];
  if (to[0] === "f") return count === 1 && suit_of(card) === Number(to.slice(1)) && fits_foundation(game, card);
  return fits_tableau(game, card, Number(to.slice(1)));
}

export function can_draw(game: Game): boolean {
  return game.stock.length > 0 || game.waste.length > 0;
}

function clone(game: Game): Game {
  return {
    ...game,
    stock: [...game.stock],
    waste: [...game.waste],
    foundations: game.foundations.map((cards) => [...cards]),
    tableau: game.tableau.map((column) => ({ cards: [...column.cards], hidden: column.hidden })),
  };
}

function points(from: PileId, to: PileId): number {
  if (to[0] === "f") return from[0] === "f" ? 0 : Points.TO_FOUNDATION;
  if (from === "w") return Points.WASTE_TO_TABLEAU;
  if (from[0] === "f") return Points.FOUNDATION_TO_TABLEAU;
  return 0;
}

export function apply(game: Game, move: Move): Game | null {
  if (move.kind === MoveKind.DRAW) {
    if (!can_draw(game)) return null;
    const next = clone(game);
    if (next.stock.length) {
      for (let i = 0; i < game.draw && next.stock.length; i++) next.waste.push(next.stock.pop()!);
    } else {
      next.stock = next.waste.reverse();
      next.waste = [];
      if (game.draw === 1) next.score = Math.max(0, next.score + Points.RECYCLE_DRAW_ONE);
    }
    next.moves++;
    return next;
  }
  const { from, to, count } = move;
  if (!can_move(game, from, to, count)) return null;
  const next = clone(game);
  const source = pile(next, from);
  pile(next, to).push(...source.splice(source.length - count, count));
  let score = next.score + points(from, to);
  if (from[0] === "t") {
    const column = next.tableau[Number(from.slice(1))];
    if (column.hidden > 0 && column.hidden === column.cards.length) {
      column.hidden--;
      score += Points.TURN_OVER;
    }
  }
  next.score = Math.max(0, score);
  next.moves++;
  return next;
}

export function is_won(game: Game): boolean {
  return game.foundations.every((cards) => cards.length === 13);
}

export function can_auto_complete(game: Game): boolean {
  return !is_won(game) && !game.stock.length && !game.waste.length && game.tableau.every((column) => column.hidden === 0);
}

export function auto_step(game: Game): Move | null {
  let best: Move | null = null;
  let best_rank = 14;
  const sources: PileId[] = ["w", ...game.tableau.map((_, i): PileId => `t${i}`)];
  for (const from of sources) {
    const card = top(pile(game, from));
    if (card === undefined || !fits_foundation(game, card) || rank_of(card) >= best_rank) continue;
    best = { kind: MoveKind.MOVE, from, to: `f${suit_of(card)}`, count: 1 };
    best_rank = rank_of(card);
  }
  return best;
}

export function best_target(game: Game, from: PileId, count: number): PileId | null {
  if (count < 1 || count > movable(game, from)) return null;
  const source = pile(game, from);
  const card = source[source.length - count];
  if (count === 1 && from[0] !== "f" && fits_foundation(game, card)) return `f${suit_of(card)}`;
  const start = from[0] === "t" ? Number(from.slice(1)) + 1 : 0;
  let empty: PileId | null = null;
  for (let step = 0; step < 7; step++) {
    const index = (start + step) % 7;
    const id: PileId = `t${index}`;
    if (id === from || !can_move(game, from, id, count)) continue;
    if (game.tableau[index].cards.length) return id;
    // A king that already heads a column gains nothing from moving to another empty one.
    const pointless = from[0] === "t" && count === source.length;
    empty ??= pointless ? null : id;
  }
  return empty;
}

// Windows Solitaire's win bonus: 700,000 / seconds, from 30 seconds on.
export function final_score(game: Game, ms: number): number {
  const seconds = Math.floor(ms / 1000);
  return game.score + (seconds >= 30 ? Math.round(700_000 / seconds) : 0);
}

export function replay(seed: number, draw: Draw, moves: readonly Move[]): Game[] {
  const states = [deal(seed, draw)];
  for (const move of moves) {
    const next = apply(states[states.length - 1], move);
    if (!next) break;
    states.push(next);
  }
  return states;
}
