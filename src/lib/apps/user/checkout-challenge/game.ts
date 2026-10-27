import { pick, random_int, type Rng } from "$lib/core/utils/random";
import { z } from "zod";

export const DAY_MS = 60_000;
export const MAX_HEALTH = 100;
export const MISTAKE_DAMAGE = 24;
export const SORRY_DAMAGE = MISTAKE_DAMAGE / 2;
export const SALE_HEAL = 3;
export const MAX_CLOSURES = 3;
export const START_SORRY = 1;
export const MAX_SORRY = 3;
export const STREAK_FOR_SORRY = 5;
export const DISPUTE_MS = 4_000;
export const LEAVE_MS = 1_100;
export const FIRST_ARRIVAL_MS = 700;
export const FLASH_MS = 900;
export const MAX_TYPED = 9;
export const SLOW_GAP_MS = 4_200;
export const FAST_GAP_MS = 900;

export const Phase = {
  READY: "ready",
  OPEN: "open",
  DAY_OVER: "day-over",
  GAME_OVER: "game-over",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const Mood = {
  WAITING: "waiting",
  HAPPY: "happy",
  MEH: "meh",
  SAD: "sad",
} as const;
export type Mood = (typeof Mood)[keyof typeof Mood];

export const Stage = {
  RINGING: "ringing",
  DISPUTED: "disputed",
  RETYPING: "retyping",
  DONE: "done",
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

export const Lamp = { OK: "ok", BAD: "bad" } as const;
export type Lamp = (typeof Lamp)[keyof typeof Lamp];

export const PRODUCTS = [
  "carrot",
  "coffee",
  "cookie",
  "bread",
  "egg",
  "fish",
  "pizza",
  "cheese",
  "ice-cream",
  "orange",
  "pepper",
  "avocado",
  "popcorn",
  "cake",
  "cherries",
  "flower",
  "book",
  "gift",
  "sock",
  "plant",
] as const;
export type Product = (typeof PRODUCTS)[number];

export interface Item {
  product: Product;
  cents: number;
  scanned: boolean;
}

export interface Customer {
  id: number;
  look: number;
  ears: number;
  items: Item[];
  /** Item indexes in the order they were scanned. */
  receipt: number[];
  mood: Mood;
  stage: Stage;
  dispute_until: number | null;
  leave_at: number | null;
  paid: number;
}

export interface DayStats {
  clean: number;
  sorry: number;
  mistakes: number;
  money: number;
}

export interface Flash {
  at: number;
}

export interface Run {
  phase: Phase;
  day: number;
  clock: number;
  health: number;
  closures: number;
  sorry_tokens: number;
  streak: number;
  money: number;
  days_survived: number;
  totals: DayStats;
  today: DayStats;
  closed_early: boolean;
  customer: Customer | null;
  next_id: number;
  next_arrival: number | null;
  typed: string;
  lamp: (Flash & { kind: Lamp }) | null;
  earned: Flash | null;
  unscanned: Flash | null;
}

export interface Difficulty {
  min_items: number;
  max_items: number;
  /** At full health; lower health scales it down. */
  max_cents: number;
  cents: boolean;
}

const EMPTY_DAY: DayStats = { clean: 0, sorry: 0, mistakes: 0, money: 0 };
const PRICE_CAPS = [900, 1_900, 999, 1_999, 4_999, 4_999, 9_999, 9_999];

export function difficulty(day: number): Difficulty {
  const index = Math.max(0, day - 1);
  return {
    min_items: Math.min(1 + Math.floor(index / 3), 4),
    max_items: Math.min(2 + Math.floor(index / 2), 7),
    max_cents: PRICE_CAPS[index] ?? Math.min(19_999 + (index - PRICE_CAPS.length) * 10_000, 99_999),
    cents: day >= 3,
  };
}

export function spend(health: number): number {
  return 0.55 + 0.45 * clamp(health / MAX_HEALTH, 0, 1);
}

export function arrival_gap(health: number, rng: Rng): number {
  const fraction = clamp(health / MAX_HEALTH, 0, 1);
  const base = SLOW_GAP_MS + (FAST_GAP_MS - SLOW_GAP_MS) * fraction;
  return Math.round(base * (0.75 + rng() * 0.5));
}

export function create_customer(id: number, day: number, health: number, rng: Rng): Customer {
  const level = difficulty(day);
  const factor = spend(health);
  const upper = level.min_items + Math.round((level.max_items - level.min_items) * factor);
  const count = random_int(level.min_items, Math.max(level.min_items, upper), rng);
  const unit = level.cents ? 1 : 100;
  const floor = level.cents ? 50 : 100;
  const cap = Math.max(floor, Math.round((level.max_cents * factor) / unit) * unit);
  const items: Item[] = Array.from({ length: count }, () => ({
    product: pick(PRODUCTS, rng),
    cents: random_int(floor / unit, cap / unit, rng) * unit,
    scanned: false,
  }));
  return {
    id,
    look: random_int(0, 2, rng),
    ears: random_int(0, 2, rng),
    items,
    receipt: [],
    mood: Mood.WAITING,
    stage: Stage.RINGING,
    dispute_until: null,
    leave_at: null,
    paid: 0,
  };
}

export function scanned_total(customer: Customer): number {
  return customer.items.reduce((sum, item) => sum + (item.scanned ? item.cents : 0), 0);
}

export function all_scanned(customer: Customer): boolean {
  return customer.items.every((item) => item.scanned);
}

export function format_amount(cents: number, with_cents: boolean): string {
  if (!with_cents && cents % 100 === 0) return String(cents / 100);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** The typed text as cents, or null when it isn't an amount yet. `7`, `7.5` and `7.50` are all the same amount. */
export function parse_amount(typed: string): number | null {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(typed);
  if (!match || (!match[1] && !match[2])) return null;
  const whole = Number(match[1] || "0");
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + fraction;
}

export function append_key(typed: string, key: string): string {
  if (typed.length >= MAX_TYPED) return typed;
  if (key === ".") return typed.includes(".") ? typed : typed + ".";
  if (!/^\d$/.test(key)) return typed;
  const dot = typed.indexOf(".");
  if (dot >= 0 && typed.length - dot > 2) return typed;
  if (typed === "0" && key !== ".") return key;
  return typed + key;
}

export function accuracy(stats: DayStats): number {
  const sales = stats.clean + stats.sorry + stats.mistakes;
  return sales === 0 ? 0 : (stats.clean + stats.sorry / 2) / sales;
}

export function sales(stats: DayStats): number {
  return stats.clean + stats.sorry + stats.mistakes;
}

/** 0 to 3 stars from the day's accuracy; a day the shop closed early earns at most one. */
export function stars(stats: DayStats, closed_early: boolean): number {
  if (sales(stats) === 0) return 0;
  const value = accuracy(stats);
  const earned = value >= 0.95 ? 3 : value >= 0.8 ? 2 : value >= 0.6 ? 1 : 0;
  return closed_early ? Math.min(earned, 1) : earned;
}

export function create_run(): Run {
  return {
    phase: Phase.READY,
    day: 1,
    clock: 0,
    health: MAX_HEALTH,
    closures: 0,
    sorry_tokens: START_SORRY,
    streak: 0,
    money: 0,
    days_survived: 0,
    totals: { ...EMPTY_DAY },
    today: { ...EMPTY_DAY },
    closed_early: false,
    customer: null,
    next_id: 1,
    next_arrival: null,
    typed: "",
    lamp: null,
    earned: null,
    unscanned: null,
  };
}

export function open_day(run: Run): Run {
  if (run.phase === Phase.OPEN || run.phase === Phase.GAME_OVER) return run;
  const next_day = run.phase === Phase.DAY_OVER;
  return {
    ...run,
    phase: Phase.OPEN,
    day: next_day ? run.day + 1 : run.day,
    health: run.closed_early ? MAX_HEALTH : run.health,
    clock: 0,
    today: { ...EMPTY_DAY },
    closed_early: false,
    customer: null,
    next_arrival: FIRST_ARRIVAL_MS,
    typed: "",
    lamp: null,
    earned: null,
    unscanned: null,
  };
}

export function tick(run: Run, dt: number, rng: Rng): Run {
  if (run.phase !== Phase.OPEN) return run;
  let next: Run = { ...run, clock: run.clock + dt };
  const customer = next.customer;
  if (customer?.stage === Stage.DISPUTED && customer.dispute_until !== null && next.clock >= customer.dispute_until) {
    next = commit_mistake(next);
  }
  if (next.customer?.leave_at != null && next.clock >= next.customer.leave_at) {
    const closing = next.closed_early || next.clock >= DAY_MS;
    next = { ...next, customer: null, next_arrival: closing ? null : next.clock + arrival_gap(next.health, rng) };
  }
  if (!next.customer && (next.closed_early || next.clock >= DAY_MS)) return end_day(next);
  if (!next.customer && next.next_arrival !== null && next.clock >= next.next_arrival) {
    next = {
      ...next,
      customer: create_customer(next.next_id, next.day, next.health, rng),
      next_id: next.next_id + 1,
      next_arrival: null,
      typed: "",
    };
  }
  return next;
}

function serving(run: Run): Customer | null {
  const customer = run.customer;
  if (run.phase !== Phase.OPEN || !customer || customer.leave_at !== null) return null;
  return customer;
}

function typing(run: Run): boolean {
  const stage = serving(run)?.stage;
  return stage === Stage.RINGING || stage === Stage.RETYPING;
}

export function scan(run: Run, index: number): Run {
  const customer = serving(run);
  if (!customer || customer.stage === Stage.DISPUTED || !customer.items[index] || customer.items[index].scanned) return run;
  const items = customer.items.map((item, at) => (at === index ? { ...item, scanned: true } : item));
  return { ...run, customer: { ...customer, items, receipt: [...customer.receipt, index] } };
}

export function scan_next(run: Run): Run {
  const index = serving(run)?.items.findIndex((item) => !item.scanned) ?? -1;
  return index < 0 ? run : scan(run, index);
}

export function type_key(run: Run, key: string): Run {
  if (!typing(run)) return run;
  const typed = append_key(run.typed, key);
  return typed === run.typed ? run : { ...run, typed };
}

export function backspace(run: Run): Run {
  if (!typing(run) || !run.typed) return run;
  return { ...run, typed: run.typed.slice(0, -1) };
}

export function enter(run: Run): Run {
  const customer = serving(run);
  if (!customer || !typing(run)) return run;
  if (!all_scanned(customer)) return { ...run, unscanned: { at: run.clock } };
  const amount = parse_amount(run.typed);
  if (amount === null) return run;
  const total = scanned_total(customer);
  if (amount === total) return paid(run, customer, total);
  const lamp = { kind: Lamp.BAD, at: run.clock };
  if (customer.stage === Stage.RINGING && run.sorry_tokens > 0) {
    return {
      ...run,
      lamp,
      streak: 0,
      customer: { ...customer, mood: Mood.SAD, stage: Stage.DISPUTED, dispute_until: run.clock + DISPUTE_MS },
    };
  }
  return commit_mistake({ ...run, lamp });
}

export function sorry(run: Run): Run {
  const customer = serving(run);
  if (!customer || customer.stage !== Stage.DISPUTED || run.sorry_tokens <= 0) return run;
  return {
    ...run,
    sorry_tokens: run.sorry_tokens - 1,
    typed: "",
    lamp: null,
    customer: { ...customer, mood: Mood.MEH, stage: Stage.RETYPING, dispute_until: null },
  };
}

export function accept_mistake(run: Run): Run {
  const customer = serving(run);
  if (!customer || customer.stage !== Stage.DISPUTED) return run;
  return commit_mistake(run);
}

function paid(run: Run, customer: Customer, total: number): Run {
  const clean = customer.stage === Stage.RINGING;
  const streak = clean ? run.streak + 1 : 0;
  const earns = clean && streak % STREAK_FOR_SORRY === 0 && run.sorry_tokens < MAX_SORRY;
  const health = clean ? Math.min(MAX_HEALTH, run.health + SALE_HEAL) : Math.max(0, run.health - SORRY_DAMAGE);
  const add: DayStats = { clean: clean ? 1 : 0, sorry: clean ? 0 : 1, mistakes: 0, money: total };
  return {
    ...run,
    health,
    streak,
    sorry_tokens: run.sorry_tokens + (earns ? 1 : 0),
    earned: earns ? { at: run.clock } : run.earned,
    money: run.money + total,
    today: add_stats(run.today, add),
    totals: add_stats(run.totals, add),
    closed_early: health <= 0,
    lamp: { kind: Lamp.OK, at: run.clock },
    customer: {
      ...customer,
      mood: clean ? Mood.HAPPY : Mood.MEH,
      stage: Stage.DONE,
      leave_at: run.clock + LEAVE_MS,
      paid: total,
    },
  };
}

function commit_mistake(run: Run): Run {
  const customer = run.customer;
  if (!customer) return run;
  const health = Math.max(0, run.health - MISTAKE_DAMAGE);
  const add: DayStats = { ...EMPTY_DAY, mistakes: 1 };
  return {
    ...run,
    health,
    streak: 0,
    today: add_stats(run.today, add),
    totals: add_stats(run.totals, add),
    closed_early: health <= 0,
    lamp: run.lamp ?? { kind: Lamp.BAD, at: run.clock },
    customer: { ...customer, mood: Mood.SAD, stage: Stage.DONE, dispute_until: null, leave_at: run.clock + LEAVE_MS, paid: 0 },
  };
}

function end_day(run: Run): Run {
  const closures = run.closed_early ? run.closures + 1 : run.closures;
  const lost = closures >= MAX_CLOSURES;
  return {
    ...run,
    closures,
    phase: lost ? Phase.GAME_OVER : Phase.DAY_OVER,
    days_survived: lost ? run.days_survived : run.days_survived + 1,
    customer: null,
    next_arrival: null,
    typed: "",
  };
}

function add_stats(a: DayStats, b: DayStats): DayStats {
  return { clean: a.clean + b.clean, sorry: a.sorry + b.sorry, mistakes: a.mistakes + b.mistakes, money: a.money + b.money };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function flashing(flash: Flash | null, clock: number, ms = FLASH_MS): boolean {
  return flash !== null && clock - flash.at < ms;
}

export const best_run_schema = z.object({
  money: z.number().int().nonnegative(),
  days: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
});
export type BestRun = z.infer<typeof best_run_schema>;

export const NO_BEST: BestRun = { money: 0, days: 0, accuracy: 0 };

export function run_summary(run: Run): BestRun {
  return { money: run.money, days: run.days_survived, accuracy: accuracy(run.totals) };
}

/** The best run is the one that took the most money; more days survived breaks a tie. */
export function better_run(candidate: BestRun, best: BestRun): boolean {
  return candidate.money > best.money || (candidate.money === best.money && candidate.days > best.days);
}

export const SPOTLESS_FROM_DAY = 5;

/** A day from `SPOTLESS_FROM_DAY` on that ended open, with sales and every one of them clean. */
export function spotless_day(run: Run): boolean {
  const { today } = run;
  return run.day >= SPOTLESS_FROM_DAY && !run.closed_early && sales(today) > 0 && today.mistakes === 0 && today.sorry === 0;
}
