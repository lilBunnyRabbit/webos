import { describe, expect, it } from "vitest";
import {
  apply,
  auto_step,
  best_target,
  can_auto_complete,
  can_move,
  deal,
  final_score,
  is_won,
  MoveKind,
  movable,
  Points,
  rank_of,
  replay,
  suit_of,
  Suit,
  type Card,
  type Game,
  type Move,
} from "./klondike";

const card = (suit: number, rank: number): Card => suit * 13 + rank - 1;
const draw: Move = { kind: MoveKind.DRAW };

function empty_game(overrides: Partial<Game> = {}): Game {
  return {
    draw: 1,
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, () => ({ cards: [], hidden: 0 })),
    score: 0,
    moves: 0,
    ...overrides,
  };
}

function with_column(game: Game, index: number, cards: Card[], hidden = 0): Game {
  game.tableau[index] = { cards, hidden };
  return game;
}

const run = (count: number, suit: number) => Array.from({ length: count }, (_, i) => card(suit, i + 1));

describe("deal", () => {
  it("lays out 28 cards in seven columns and 24 in the stock", () => {
    const game = deal(42, 1);
    expect(game.tableau.map((column) => column.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(game.tableau.map((column) => column.hidden)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(game.stock).toHaveLength(24);
    const all = [...game.stock, ...game.tableau.flatMap((column) => column.cards)].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 52 }, (_, i) => i));
  });

  it("is the same deal for the same seed and different for another", () => {
    expect(deal(7, 1)).toEqual(deal(7, 1));
    expect(deal(7, 1).stock).not.toEqual(deal(8, 1).stock);
  });
});

describe("draw", () => {
  it("turns one or three cards onto the waste", () => {
    const one = apply(deal(1, 1), draw)!;
    expect(one.waste).toHaveLength(1);
    expect(one.stock).toHaveLength(23);
    const three = apply(deal(1, 3), draw)!;
    expect(three.waste).toHaveLength(3);
    expect(three.waste[2]).toBe(deal(1, 3).stock[21]);
    expect(three.moves).toBe(1);
  });

  it("recycles the waste in its original order, costing 100 only in draw one", () => {
    const start = empty_game({ stock: [1, 2, 3], score: 150 });
    let game = start;
    for (let i = 0; i < 3; i++) game = apply(game, draw)!;
    expect(game.waste).toEqual([3, 2, 1]);
    game = apply(game, draw)!;
    expect(game.stock).toEqual([1, 2, 3]);
    expect(game.waste).toEqual([]);
    expect(game.score).toBe(50);

    let three = empty_game({ draw: 3, stock: [1, 2, 3], score: 150 });
    three = apply(apply(three, draw)!, draw)!;
    expect(three.score).toBe(150);
  });

  it("never scores below zero", () => {
    const game = apply(empty_game({ waste: [1] }), draw)!;
    expect(game.score).toBe(0);
  });

  it("can't draw from nothing", () => {
    expect(apply(empty_game(), draw)).toBeNull();
  });
});

describe("moves", () => {
  it("stacks a lower card of the other colour", () => {
    const game = with_column(with_column(empty_game(), 0, [card(Suit.SPADES, 8)]), 1, [card(Suit.HEARTS, 7)]);
    expect(can_move(game, "t1", "t0", 1)).toBe(true);
    const clubs = with_column(empty_game(), 0, [card(Suit.SPADES, 8)]);
    with_column(clubs, 1, [card(Suit.CLUBS, 7)]);
    expect(can_move(clubs, "t1", "t0", 1)).toBe(false);
  });

  it("only takes a king on an empty column", () => {
    const game = with_column(with_column(empty_game(), 0, [card(Suit.HEARTS, 13)]), 1, [card(Suit.SPADES, 12)]);
    expect(can_move(game, "t0", "t2", 1)).toBe(true);
    expect(can_move(game, "t1", "t2", 1)).toBe(false);
  });

  it("moves face-up stacks together and turns the card below, scoring 5", () => {
    const game = with_column(
      with_column(empty_game(), 0, [card(Suit.CLUBS, 2), card(Suit.SPADES, 9), card(Suit.HEARTS, 8)], 1),
      1,
      [card(Suit.DIAMONDS, 10)]
    );
    expect(movable(game, "t0")).toBe(2);
    const next = apply(game, { kind: MoveKind.MOVE, from: "t0", to: "t1", count: 2 })!;
    expect(next.tableau[1].cards).toEqual([card(Suit.DIAMONDS, 10), card(Suit.SPADES, 9), card(Suit.HEARTS, 8)]);
    expect(next.tableau[0]).toEqual({ cards: [card(Suit.CLUBS, 2)], hidden: 0 });
    expect(next.score).toBe(Points.TURN_OVER);
    expect(game.tableau[0].cards).toHaveLength(3);
  });

  it("refuses face-down cards", () => {
    const game = with_column(empty_game(), 0, [card(Suit.HEARTS, 13), card(Suit.SPADES, 5)], 1);
    expect(can_move(game, "t0", "t1", 2)).toBe(false);
  });

  it("builds foundations by suit from the ace, one card at a time", () => {
    const game = with_column(empty_game({ waste: [card(Suit.HEARTS, 1)] }), 0, [card(Suit.HEARTS, 3), card(Suit.SPADES, 2)]);
    expect(can_move(game, "w", "f0", 1)).toBe(false);
    const ace = apply(game, { kind: MoveKind.MOVE, from: "w", to: "f1", count: 1 })!;
    expect(ace.score).toBe(Points.TO_FOUNDATION);
    expect(can_move(ace, "t0", "f1", 1)).toBe(false);
    expect(can_move(ace, "t0", "f1", 2)).toBe(false);
  });

  it("scores waste to tableau and charges foundation to tableau", () => {
    const game = with_column(
      empty_game({ waste: [card(Suit.HEARTS, 12)], foundations: [[], [], [], run(4, Suit.CLUBS)], score: 20 }),
      0,
      [card(Suit.SPADES, 13)]
    );
    with_column(game, 1, [card(Suit.HEARTS, 5)]);
    expect(apply(game, { kind: MoveKind.MOVE, from: "w", to: "t0", count: 1 })!.score).toBe(25);
    expect(apply(game, { kind: MoveKind.MOVE, from: "f3", to: "t1", count: 1 })!.score).toBe(5);
  });
});

describe("best_target", () => {
  it("sends a single fitting card to its foundation first", () => {
    const game = with_column(with_column(empty_game(), 0, [card(Suit.SPADES, 1)]), 1, [card(Suit.HEARTS, 2)]);
    expect(best_target(game, "t0", 1)).toBe("f0");
  });

  it("prefers a column with cards over an empty one", () => {
    const game = with_column(empty_game({ waste: [card(Suit.HEARTS, 12)] }), 5, [card(Suit.CLUBS, 13)]);
    expect(best_target(game, "w", 1)).toBe("t5");
  });

  it("doesn't move a king that already heads its column", () => {
    const game = with_column(empty_game(), 2, [card(Suit.CLUBS, 13), card(Suit.HEARTS, 12)]);
    expect(best_target(game, "t2", 2)).toBeNull();
    with_column(game, 3, [card(Suit.SPADES, 4), card(Suit.CLUBS, 13)], 1);
    expect(best_target(game, "t3", 1)).toBe("t4");
  });
});

describe("winning", () => {
  it("is won with four full foundations", () => {
    expect(is_won(empty_game({ foundations: SUITSx13() }))).toBe(true);
    expect(is_won(empty_game())).toBe(false);
  });

  it("auto-completes once everything is face up and dealt", () => {
    let game = empty_game({ foundations: [run(10, 0), run(12, 1), run(13, 2), run(11, 3)] });
    with_column(game, 0, [card(0, 13), card(1, 13), card(0, 12), card(0, 11)]);
    with_column(game, 1, [card(3, 13), card(3, 12)]);
    expect(can_auto_complete(game)).toBe(true);
    expect(can_auto_complete({ ...game, waste: [1] })).toBe(false);
    let steps = 0;
    for (let move = auto_step(game); move; move = auto_step(game)) {
      game = apply(game, move)!;
      steps++;
    }
    expect(steps).toBe(6);
    expect(is_won(game)).toBe(true);
  });

  it("adds the time bonus from 30 seconds", () => {
    const game = empty_game({ score: 500 });
    expect(final_score(game, 20_000)).toBe(500);
    expect(final_score(game, 100_000)).toBe(7500);
  });
});

describe("replay", () => {
  it("rebuilds every state from the seed and the moves", () => {
    const states = replay(3, 3, [draw, draw, draw]);
    expect(states).toHaveLength(4);
    expect(states[3].waste).toHaveLength(9);
    expect(states[3].moves).toBe(3);
  });

  it("stops at an illegal move", () => {
    expect(replay(3, 1, [{ kind: MoveKind.MOVE, from: "w", to: "f0", count: 1 }, draw])).toHaveLength(1);
  });
});

describe("cards", () => {
  it("encode suit and rank", () => {
    expect(suit_of(card(Suit.DIAMONDS, 12))).toBe(Suit.DIAMONDS);
    expect(rank_of(card(Suit.DIAMONDS, 12))).toBe(12);
  });
});

function SUITSx13(): Card[][] {
  return [0, 1, 2, 3].map((suit) => run(13, suit));
}
