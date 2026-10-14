import { describe, expect, test } from "vitest";
import {
  create_game,
  Direction,
  fixed_steps,
  same_point,
  set_status,
  spawn_food,
  Status,
  step,
  turn,
  type GameState,
  type Point,
} from "./game";

const zero = () => 0;

function playing(overrides: Partial<GameState> = {}): GameState {
  return { ...set_status(create_game(zero, false, 10, 10), Status.PLAYING), ...overrides };
}

describe("create_game", () => {
  test("starts a three-cell snake in the middle heading right, waiting to start", () => {
    const game = create_game(zero, false, 10, 10);
    expect(game.snake).toEqual([
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ]);
    expect(game.direction).toBe(Direction.RIGHT);
    expect(game.status).toBe(Status.READY);
    expect(game.food).not.toBeNull();
  });
});

describe("step", () => {
  test("does nothing unless playing", () => {
    const game = create_game(zero, false, 10, 10);
    expect(step(game, zero)).toBe(game);
    expect(step(set_status(game, Status.PAUSED), zero).snake).toEqual(game.snake);
  });

  test("moves the head one cell and drops the tail", () => {
    const game = playing({ food: { x: 0, y: 0 } });
    const next = step(game, zero);
    expect(next.snake).toEqual([
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ]);
  });

  test("applies queued turns one per step", () => {
    let game = playing({ food: { x: 0, y: 0 } });
    game = turn(game, Direction.UP);
    game = turn(game, Direction.LEFT);
    game = step(game, zero);
    expect(game.snake[0]).toEqual({ x: 5, y: 4 });
    expect(game.direction).toBe(Direction.UP);
    game = step(game, zero);
    expect(game.snake[0]).toEqual({ x: 4, y: 4 });
    expect(game.direction).toBe(Direction.LEFT);
  });

  test("grows and scores when it eats, and spawns new food", () => {
    const game = playing({ food: { x: 6, y: 5 } });
    const next = step(game, zero);
    expect(next.snake).toHaveLength(4);
    expect(next.score).toBe(1);
    expect(next.food).not.toBeNull();
    expect(next.snake.some((p) => same_point(p, next.food as Point))).toBe(false);
  });

  test("ends the game at a wall", () => {
    const game = playing({
      snake: [
        { x: 9, y: 5 },
        { x: 8, y: 5 },
      ],
      food: { x: 0, y: 0 },
    });
    expect(step(game, zero).status).toBe(Status.OVER);
  });

  test("wraps around when walls are off", () => {
    const game = playing({
      snake: [
        { x: 9, y: 5 },
        { x: 8, y: 5 },
      ],
      food: { x: 0, y: 0 },
      wrap: true,
    });
    const next = step(game, zero);
    expect(next.status).toBe(Status.PLAYING);
    expect(next.snake[0]).toEqual({ x: 0, y: 5 });
  });

  test("ends the game when the head hits the body", () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
      { x: 6, y: 4 },
    ];
    const game = playing({ snake, direction: Direction.UP, queue: [Direction.RIGHT], food: { x: 0, y: 0 } });
    expect(step(game, zero).status).toBe(Status.OVER);
  });

  test("may move into the cell the tail is leaving", () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ];
    const game = playing({ snake, direction: Direction.UP, queue: [Direction.RIGHT], food: { x: 0, y: 0 } });
    const next = step(game, zero);
    expect(next.status).toBe(Status.PLAYING);
    expect(next.snake[0]).toEqual({ x: 6, y: 5 });
  });

  test("but not when it grows this step", () => {
    const snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
    ];
    const game = playing({ snake, direction: Direction.UP, queue: [Direction.RIGHT], food: { x: 6, y: 5 } });
    expect(step(game, zero).status).toBe(Status.OVER);
  });

  test("wins when the snake fills the board", () => {
    const game = playing({
      width: 2,
      height: 2,
      snake: [
        { x: 0, y: 1 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      direction: Direction.DOWN,
      queue: [Direction.RIGHT],
      food: { x: 1, y: 1 },
    });
    const next = step(game, zero);
    expect(next.status).toBe(Status.WON);
    expect(next.food).toBeNull();
  });
});

describe("turn", () => {
  test("ignores a direct reversal", () => {
    const game = playing();
    expect(turn(game, Direction.LEFT).queue).toEqual([]);
  });

  test("never reverses within one step through two quick presses", () => {
    let game = playing({ food: { x: 0, y: 0 } });
    game = turn(game, Direction.UP);
    game = turn(game, Direction.DOWN);
    expect(game.queue).toEqual([Direction.UP]);
    game = step(game, zero);
    expect(game.snake[0]).toEqual({ x: 5, y: 4 });
  });

  test("ignores the direction it is already heading", () => {
    expect(turn(playing(), Direction.RIGHT).queue).toEqual([]);
  });

  test("holds at most two turns", () => {
    let game = playing();
    game = turn(game, Direction.UP);
    game = turn(game, Direction.LEFT);
    game = turn(game, Direction.DOWN);
    expect(game.queue).toEqual([Direction.UP, Direction.LEFT]);
  });

  test("does nothing once the game is over", () => {
    const game = playing({ status: Status.OVER });
    expect(turn(game, Direction.UP)).toBe(game);
  });
});

describe("spawn_food", () => {
  const snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ];

  test("never lands on the snake, whatever the rng says", () => {
    for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const food = spawn_food(snake, 3, 2, () => value);
      expect(food).not.toBeNull();
      expect(snake.some((p) => same_point(p, food as Point))).toBe(false);
    }
  });

  test("picks among free cells by the rng", () => {
    expect(spawn_food(snake, 3, 2, () => 0)).toEqual({ x: 0, y: 1 });
    expect(spawn_food(snake, 3, 2, () => 0.99)).toEqual({ x: 2, y: 1 });
  });

  test("returns null when no cell is free", () => {
    expect(spawn_food(snake, 3, 1, zero)).toBeNull();
  });
});

describe("fixed_steps", () => {
  test("runs whole steps and carries the rest", () => {
    expect(fixed_steps(0, 250, 100)).toEqual({ steps: 2, remainder: 50 });
    expect(fixed_steps(50, 60, 100)).toEqual({ steps: 1, remainder: 10 });
    expect(fixed_steps(0, 40, 100)).toEqual({ steps: 0, remainder: 40 });
  });

  test("drops the backlog after a long frame", () => {
    expect(fixed_steps(0, 10_000, 100, 5)).toEqual({ steps: 5, remainder: 0 });
  });

  test("treats negative time as none", () => {
    expect(fixed_steps(30, -5, 100)).toEqual({ steps: 0, remainder: 30 });
  });
});
