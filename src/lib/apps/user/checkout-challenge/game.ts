import { pick, random_int, shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";

export const FIRST_CUSTOMERS = 5;
export const MAX_CUSTOMERS = 12;
export const ARRIVAL_MS = 700;
export const STAFF_ARRIVAL_MS = 150;
export const LEAVE_MS = 1_800;
export const FLASH_MS = 900;
export const MAX_TYPED = 9;

export const START_TRUST = 60;
export const MAX_TRUST = 100;
export const TRUST_GAIN = 8;
export const SALE_TRUST_BONUS = 4;
export const TRUST_LOSS = 25;
export const LOW_TRUST = 35;
export const RETURN_CHANCE = 0.35;
export const SALE_RETURN_BONUS = 0.25;
export const PARTY_TRUST = 80;
export const PARTY_CHANCE = 0.4;
export const PARTY_EXTRA_MIN = 3;
export const PARTY_EXTRA_MAX = 5;
export const MAX_ROSTER = 30;

export const REPORT_STRIKES = 2;
export const POLICE_MIN = 2;
export const POLICE_MAX = 5;
export const MAX_JAIL_DAYS = 3;

export const STAFF_CUSTOMERS = 4;
export const STAFF_SHARE = 1;
export const BILLS_SHARE = 1.2;
export const STOCK_SHARE = 0.4;
export const STOCK_FULL = 8;
export const SALE_DISCOUNT = 0.2;

export const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export const Phase = {
  READY: "ready",
  WARMUP: "warmup",
  OPEN: "open",
  RESTOCK: "restock",
  DAY_OVER: "day-over",
  GAME_OVER: "game-over",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const Mood = {
  WAITING: "waiting",
  HAPPY: "happy",
  SAD: "sad",
  VEXED: "vexed",
} as const;
export type Mood = (typeof Mood)[keyof typeof Mood];

export const Stage = {
  ITEMS: "items",
  TOTAL: "total",
  CONFIRM: "confirm",
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

/** Restock codes. Two digits each, so a code is always settled by its second digit. */
export const PRODUCT_CODES: Record<Product, string> = {
  carrot: "12",
  coffee: "58",
  cookie: "37",
  bread: "43",
  egg: "26",
  fish: "71",
  pizza: "89",
  cheese: "64",
  "ice-cream": "95",
  orange: "30",
  pepper: "17",
  avocado: "82",
  popcorn: "49",
  cake: "53",
  cherries: "68",
  flower: "21",
  book: "76",
  gift: "90",
  sock: "34",
  plant: "05",
};

export const NAMES = [
  "Mia",
  "Leo",
  "Ava",
  "Noah",
  "Ivy",
  "Finn",
  "Zoe",
  "Max",
  "Lily",
  "Sam",
  "Nora",
  "Theo",
  "Ella",
  "Jack",
  "Ruby",
  "Oscar",
  "Maya",
  "Hugo",
  "Rosa",
  "Eli",
  "Iris",
  "Otto",
  "Lena",
  "Kai",
] as const;

export interface Patron {
  id: number;
  name: string;
  tag: number | null;
  look: number;
  ears: number;
  /** Shown as their opinion of the shop in %. At 0 they never come back. */
  trust: number;
  visits: number;
  strikes: number;
}

export interface Item {
  product: Product;
  cents: number;
  entered: number | null;
}

export interface Result {
  given: number;
  total: number;
}

export interface Customer {
  id: number;
  patron: number;
  items: Item[];
  stage: Stage;
  party: boolean;
  staffed: boolean;
  doubting: boolean;
  first: number | null;
  result: Result | null;
  mood: Mood;
  leave_at: number | null;
}

export interface DayStats {
  served: number;
  right: number;
  wrong: number;
  money: number;
  wages: number;
  stock_cost: number;
  parties: number;
  cleared: number;
}

export interface Books {
  takings: number;
  wages: number;
  bills: number;
  stock: number;
}

export interface Flash {
  at: number;
}

export type Stock = Record<Product, number>;

export interface Run {
  phase: Phase;
  day: number;
  clock: number;
  money: number;
  jail_days: number;
  days_survived: number;
  totals: DayStats;
  today: DayStats;
  jailed: boolean;
  sale: boolean;
  roster: Patron[];
  next_patron: number;
  /** Patrons who came in today; nobody comes twice a day. */
  seen_today: number[];
  stock: Stock;
  restock: Product[];
  code: string;
  code_miss: Flash | null;
  warmup: string[];
  warm_miss: Flash | null;
  customer: Customer | null;
  next_id: number;
  arrived: number;
  next_arrival: number | null;
  staff_left: number;
  /** Customers left under police watch; the player never sees it. */
  police_left: number;
  reported: Flash | null;
  typed: string;
  lamp: (Flash & { kind: Lamp }) | null;
  books: Books | null;
}

export interface Difficulty {
  min_items: number;
  max_items: number;
  max_cents: number;
  cents: boolean;
}

export const EMPTY_DAY: DayStats = {
  served: 0,
  right: 0,
  wrong: 0,
  money: 0,
  wages: 0,
  stock_cost: 0,
  parties: 0,
  cleared: 0,
};
const PRICE_CAPS = [900, 1_900, 999, 1_999, 4_999, 4_999, 9_999, 9_999];
const MAX_PARTY_ITEMS = 10;

export function difficulty(day: number): Difficulty {
  const index = Math.max(0, day - 1);
  return {
    min_items: Math.min(1 + Math.floor(index / 3), 4),
    max_items: Math.min(2 + Math.floor(index / 2), 7),
    max_cents: PRICE_CAPS[index] ?? Math.min(19_999 + (index - PRICE_CAPS.length) * 10_000, 99_999),
    cents: day >= 3,
  };
}

export function day_customers(day: number): number {
  return Math.min(FIRST_CUSTOMERS + Math.max(0, day - 1), MAX_CUSTOMERS);
}

export function staff_price(day: number): number {
  return round_to(difficulty(day).max_cents * STAFF_SHARE, 100);
}

export function bills(day: number): number {
  return round_to(difficulty(day).max_cents * BILLS_SHARE, 100);
}

export function full_stock(): Stock {
  return Object.fromEntries(PRODUCTS.map((product) => [product, STOCK_FULL])) as Stock;
}

export function patron_label(patron: Pick<Patron, "name" | "tag">): string {
  return patron.tag === null ? patron.name : `${patron.name} #${patron.tag}`;
}

export function low_trust(patron: Patron): boolean {
  return patron.trust < LOW_TRUST;
}

export function format_amount(cents: number, with_cents: boolean): string {
  const sign = cents < 0 ? "-" : "";
  const value = Math.abs(cents);
  if (!with_cents && value % 100 === 0) return `${sign}${value / 100}`;
  return `${sign}${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}

export function mask(typed: string): string {
  return typed.replace(/\d/g, "*");
}

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

export function list_total(customer: Customer): number {
  return customer.items.reduce((sum, item) => sum + item.cents, 0);
}

export function entered_total(customer: Customer): number {
  return customer.items.reduce((sum, item) => sum + (item.entered ?? 0), 0);
}

export function current_item(customer: Customer): number {
  return customer.items.findIndex((item) => item.entered === null);
}

export function accuracy(stats: DayStats): number {
  return stats.served === 0 ? 0 : stats.right / stats.served;
}

export function stars(stats: DayStats, jailed: boolean): number {
  if (stats.served === 0) return 0;
  const value = accuracy(stats);
  const earned = value >= 0.95 ? 3 : value >= 0.8 ? 2 : value >= 0.6 ? 1 : 0;
  return jailed ? Math.min(earned, 1) : earned;
}

export function profit(books: Books): number {
  return books.takings - books.wages - books.bills - books.stock;
}

export function create_run(): Run {
  return {
    phase: Phase.READY,
    day: 1,
    clock: 0,
    money: 0,
    jail_days: 0,
    days_survived: 0,
    totals: { ...EMPTY_DAY },
    today: { ...EMPTY_DAY },
    jailed: false,
    sale: false,
    roster: [],
    next_patron: 1,
    seen_today: [],
    stock: full_stock(),
    restock: [],
    code: "",
    code_miss: null,
    warmup: [],
    warm_miss: null,
    customer: null,
    next_id: 1,
    arrived: 0,
    next_arrival: null,
    staff_left: 0,
    police_left: 0,
    reported: null,
    typed: "",
    lamp: null,
    books: null,
  };
}

export function begin_day(run: Run, rng: Rng): Run {
  if (run.phase !== Phase.READY && run.phase !== Phase.DAY_OVER) return run;
  return {
    ...run,
    phase: Phase.WARMUP,
    day: run.phase === Phase.DAY_OVER ? run.day + 1 : run.day,
    clock: 0,
    today: { ...EMPTY_DAY },
    jailed: false,
    seen_today: [],
    restock: [],
    code: "",
    code_miss: null,
    warmup: shuffle([...DIGITS], rng),
    warm_miss: null,
    customer: null,
    arrived: 0,
    next_arrival: null,
    reported: null,
    typed: "",
    lamp: null,
    books: null,
  };
}

export function warm_key(run: Run, key: string): Run {
  if (run.phase !== Phase.WARMUP || !/^\d$/.test(key)) return run;
  if (key !== run.warmup[0]) return { ...run, warm_miss: { at: run.clock } };
  const warmup = run.warmup.slice(1);
  if (warmup.length > 0) return { ...run, warmup, warm_miss: null };
  return { ...run, warmup, warm_miss: null, phase: Phase.OPEN, next_arrival: run.clock + ARRIVAL_MS };
}

/** Moves the clock; only the warm-up's flashes and the walk in and out of the shop use it. Days have no time limit. */
export function tick(run: Run, dt: number, rng: Rng): Run {
  if (run.phase !== Phase.OPEN && run.phase !== Phase.WARMUP && run.phase !== Phase.RESTOCK) return run;
  let next: Run = { ...run, clock: run.clock + dt };
  if (next.phase !== Phase.OPEN) return next;
  if (next.customer?.leave_at != null && next.clock >= next.customer.leave_at) {
    const gap = next.staff_left > 0 ? STAFF_ARRIVAL_MS : ARRIVAL_MS;
    next = { ...next, customer: null, next_arrival: next.clock + gap };
  }
  if (!next.customer && (next.jailed || next.arrived >= day_customers(next.day))) return end_day(next);
  if (!next.customer && next.next_arrival !== null && next.clock >= next.next_arrival) next = arrive(next, rng);
  return next;
}

function arrive(run: Run, rng: Rng): Run {
  const visit = choose_patron(run, rng);
  const patron = { ...visit.patron, visits: visit.patron.visits + 1 };
  const roster = visit.roster.map((entry) => (entry.id === patron.id ? patron : entry));
  const party = visit.returning && patron.trust >= PARTY_TRUST && rng() < PARTY_CHANCE;
  const staffed = run.staff_left > 0;
  const items = basket(run, party, rng);
  if (staffed) for (const item of items) item.entered = item.cents;
  const customer: Customer = {
    id: run.next_id,
    patron: patron.id,
    items,
    stage: staffed ? Stage.TOTAL : Stage.ITEMS,
    party,
    staffed,
    doubting: low_trust(patron),
    first: null,
    result: null,
    mood: run.police_left > 0 ? Mood.VEXED : Mood.WAITING,
    leave_at: null,
  };
  return {
    ...run,
    roster,
    next_patron: visit.next_patron,
    seen_today: [...run.seen_today, patron.id],
    customer,
    next_id: run.next_id + 1,
    arrived: run.arrived + 1,
    next_arrival: null,
    staff_left: Math.max(0, run.staff_left - 1),
    typed: "",
  };
}

interface Visit {
  patron: Patron;
  roster: Patron[];
  next_patron: number;
  returning: boolean;
}

export function choose_patron(run: Run, rng: Rng): Visit {
  const regulars = run.roster.filter((patron) => patron.trust > 0 && !run.seen_today.includes(patron.id));
  const chance = RETURN_CHANCE + (run.sale ? SALE_RETURN_BONUS : 0);
  if (regulars.length > 0 && rng() < chance) {
    const weights = regulars.map((patron) => 0.25 + patron.trust / MAX_TRUST);
    let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
    const patron = regulars.find((_, index) => (roll -= weights[index]) < 0) ?? regulars[regulars.length - 1];
    return { patron, roster: run.roster, next_patron: run.next_patron, returning: true };
  }
  return new_patron(run, rng);
}

function new_patron(run: Run, rng: Rng): Visit {
  let roster = run.roster;
  if (roster.length >= MAX_ROSTER) {
    const leaving = roster
      .filter((patron) => !run.seen_today.includes(patron.id))
      .sort((a, b) => a.trust - b.trust || a.visits - b.visits)[0];
    if (leaving) roster = roster.filter((patron) => patron.id !== leaving.id);
  }
  const name = pick(NAMES, rng);
  const namesakes = roster.filter((patron) => patron.name === name);
  const taken = new Set(namesakes.map((patron) => patron.tag));
  const free_tag = () => {
    let tag = random_int(10, 99, rng);
    while (taken.has(tag)) tag = tag === 99 ? 10 : tag + 1;
    taken.add(tag);
    return tag;
  };
  if (namesakes.length > 0) {
    roster = roster.map((patron) => (patron.name === name && patron.tag === null ? { ...patron, tag: free_tag() } : patron));
  }
  const patron: Patron = {
    id: run.next_patron,
    name,
    tag: namesakes.length > 0 ? free_tag() : null,
    look: random_int(0, 2, rng),
    ears: random_int(0, 2, rng),
    trust: START_TRUST,
    visits: 0,
    strikes: 0,
  };
  return { patron, roster: [...roster, patron], next_patron: run.next_patron + 1, returning: false };
}

function basket(run: Run, party: boolean, rng: Rng): Item[] {
  const level = difficulty(run.day);
  const extra = party ? random_int(PARTY_EXTRA_MIN, PARTY_EXTRA_MAX, rng) : 0;
  const count = Math.min(random_int(level.min_items, level.max_items, rng) + extra, Math.max(level.max_items, MAX_PARTY_ITEMS));
  const unit = level.cents ? 1 : 100;
  const floor = level.cents ? 50 : 100;
  const left = { ...run.stock };
  return Array.from({ length: count }, () => {
    const shelf = PRODUCTS.filter((product) => left[product] > 0);
    const product = pick(shelf.length > 0 ? shelf : PRODUCTS, rng);
    left[product] = Math.max(0, left[product] - 1);
    const price = random_int(floor / unit, level.max_cents / unit, rng) * unit;
    const cents = run.sale ? Math.max(unit, Math.round((price * (1 - SALE_DISCOUNT)) / unit) * unit) : price;
    return { product, cents, entered: null };
  });
}

function serving(run: Run): Customer | null {
  const customer = run.customer;
  if (run.phase !== Phase.OPEN || !customer || customer.stage === Stage.DONE) return null;
  return customer;
}

export function type_key(run: Run, key: string): Run {
  if (!serving(run)) return run;
  const typed = append_key(run.typed, key);
  return typed === run.typed ? run : { ...run, typed };
}

export function backspace(run: Run): Run {
  if (!serving(run) || !run.typed) return run;
  return { ...run, typed: run.typed.slice(0, -1) };
}

export function enter(run: Run, rng: Rng): Run {
  const customer = serving(run);
  if (!customer) return run;
  const amount = parse_amount(run.typed);
  if (amount === null) return run;
  if (customer.stage === Stage.ITEMS) {
    const index = current_item(customer);
    const items = customer.items.map((item, at) => (at === index ? { ...item, entered: amount } : item));
    const stage = items.every((item) => item.entered !== null) ? Stage.TOTAL : Stage.ITEMS;
    return { ...run, typed: "", customer: { ...customer, items, stage } };
  }
  if (customer.stage === Stage.TOTAL && customer.doubting) {
    return { ...run, typed: "", customer: { ...customer, stage: Stage.CONFIRM, first: amount } };
  }
  const total = list_total(customer);
  const given = customer.first !== null && customer.first !== total ? customer.first : amount;
  return settle({ ...run, typed: "" }, customer, { given, total }, rng);
}

function settle(run: Run, customer: Customer, result: Result, rng: Rng): Run {
  const right = result.given === result.total;
  const patron = run.roster.find((entry) => entry.id === customer.patron);
  const watched = run.police_left > 0;
  let police_left = run.police_left;
  let jailed = run.jailed;
  let reported: Flash | null = run.reported;
  let cleared = 0;
  let trust = patron?.trust ?? START_TRUST;
  let strikes = patron?.strikes ?? 0;
  if (right) {
    trust = Math.min(MAX_TRUST, trust + TRUST_GAIN + (run.sale ? SALE_TRUST_BONUS : 0));
    if (watched) {
      police_left -= 1;
      if (police_left === 0) cleared = 1;
    }
  } else {
    trust = Math.max(0, trust - TRUST_LOSS);
    if (trust < LOW_TRUST) strikes += 1;
    if (watched) {
      jailed = true;
      police_left = 0;
    } else if (strikes >= REPORT_STRIKES) {
      strikes = 0;
      police_left = random_int(POLICE_MIN, POLICE_MAX, rng);
      reported = { at: run.clock };
    }
  }
  const roster = run.roster.map((entry) => (entry.id === customer.patron ? { ...entry, trust, strikes } : entry));
  const stock = { ...run.stock };
  if (right) for (const item of customer.items) stock[item.product] = Math.max(0, stock[item.product] - 1);
  const add: DayStats = {
    ...EMPTY_DAY,
    served: 1,
    right: right ? 1 : 0,
    wrong: right ? 0 : 1,
    money: right ? result.total : 0,
    stock_cost: right ? Math.round(result.total * STOCK_SHARE) : 0,
    parties: right && customer.party ? 1 : 0,
    cleared,
  };
  return {
    ...run,
    roster,
    stock,
    police_left,
    jailed,
    jail_days: jailed && !run.jailed ? run.jail_days + 1 : run.jail_days,
    reported,
    money: run.money + add.money,
    today: add_stats(run.today, add),
    totals: add_stats(run.totals, add),
    lamp: { kind: right ? Lamp.OK : Lamp.BAD, at: run.clock },
    customer: {
      ...customer,
      stage: Stage.DONE,
      result,
      mood: right ? Mood.HAPPY : watched || police_left > 0 ? Mood.VEXED : Mood.SAD,
      leave_at: run.clock + LEAVE_MS,
    },
  };
}

export function can_hire(run: Run): boolean {
  return (
    run.phase === Phase.OPEN &&
    run.staff_left === 0 &&
    !run.jailed &&
    run.money >= staff_price(run.day) &&
    run.arrived < day_customers(run.day)
  );
}

export function hire_staff(run: Run): Run {
  if (!can_hire(run)) return run;
  const price = staff_price(run.day);
  const add: DayStats = { ...EMPTY_DAY, wages: price };
  return {
    ...run,
    money: run.money - price,
    staff_left: STAFF_CUSTOMERS,
    today: add_stats(run.today, add),
    totals: add_stats(run.totals, add),
  };
}

function end_day(run: Run): Run {
  const roster = run.roster.filter((patron) => patron.trust > 0);
  if (run.jailed && run.jail_days >= MAX_JAIL_DAYS) {
    return { ...run, roster, phase: Phase.GAME_OVER, customer: null, next_arrival: null, typed: "" };
  }
  const books: Books = {
    takings: run.today.money,
    wages: run.today.wages,
    bills: bills(run.day),
    stock: run.today.stock_cost,
  };
  const restock = PRODUCTS.filter((product) => run.stock[product] < STOCK_FULL);
  return {
    ...run,
    roster,
    phase: restock.length > 0 ? Phase.RESTOCK : Phase.DAY_OVER,
    money: run.money - books.bills - books.stock,
    days_survived: run.days_survived + 1,
    books,
    restock,
    code: "",
    code_miss: null,
    customer: null,
    next_arrival: null,
    typed: "",
  };
}

export function restock_key(run: Run, key: string): Run {
  if (run.phase !== Phase.RESTOCK || !/^\d$/.test(key)) return run;
  const code = run.code + key;
  const hit = run.restock.find((product) => PRODUCT_CODES[product] === code);
  if (hit) {
    const restock = run.restock.filter((product) => product !== hit);
    const stock = { ...run.stock, [hit]: STOCK_FULL };
    return { ...run, stock, restock, code: "", code_miss: null, phase: restock.length > 0 ? Phase.RESTOCK : Phase.DAY_OVER };
  }
  if (run.restock.some((product) => PRODUCT_CODES[product].startsWith(code))) return { ...run, code };
  return { ...run, code: "", code_miss: { at: run.clock } };
}

export function toggle_sale(run: Run): Run {
  return run.phase === Phase.DAY_OVER ? { ...run, sale: !run.sale } : run;
}

function add_stats(a: DayStats, b: DayStats): DayStats {
  return {
    served: a.served + b.served,
    right: a.right + b.right,
    wrong: a.wrong + b.wrong,
    money: a.money + b.money,
    wages: a.wages + b.wages,
    stock_cost: a.stock_cost + b.stock_cost,
    parties: a.parties + b.parties,
    cleared: a.cleared + b.cleared,
  };
}

function round_to(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step);
}

export function flashing(flash: Flash | null, clock: number, ms = FLASH_MS): boolean {
  return flash !== null && clock - flash.at < ms;
}

const day_stats_schema = z.object({
  served: z.number().int().nonnegative(),
  right: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  money: z.number().int().nonnegative(),
  wages: z.number().int().nonnegative(),
  stock_cost: z.number().int().nonnegative(),
  parties: z.number().int().nonnegative(),
  cleared: z.number().int().nonnegative(),
});

const patron_schema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  tag: z.number().int().nullable(),
  look: z.number().int().nonnegative(),
  ears: z.number().int().nonnegative(),
  trust: z.number().min(0).max(MAX_TRUST),
  visits: z.number().int().nonnegative(),
  strikes: z.number().int().nonnegative(),
});

/** The run between days: written when a day's restock is done, read by Continue. Nothing mid-day. Staff and police
 * fields came after the first saves, so they default to 0. */
export const saved_run_schema = z.object({
  version: z.literal(1),
  day: z.number().int().positive(),
  money: z.number().int(),
  jail_days: z.number().int().nonnegative(),
  days_survived: z.number().int().nonnegative(),
  sale: z.boolean(),
  totals: day_stats_schema,
  roster: z.array(patron_schema),
  next_patron: z.number().int().positive(),
  stock: z.record(z.enum(PRODUCTS), z.number().int().min(0).max(STOCK_FULL)),
  staff_left: z.number().int().nonnegative().default(0),
  police_left: z.number().int().nonnegative().default(0),
});
export type SavedRun = z.infer<typeof saved_run_schema>;

export function save_run(run: Run): SavedRun {
  return {
    version: 1,
    day: run.day,
    money: run.money,
    jail_days: run.jail_days,
    days_survived: run.days_survived,
    sale: run.sale,
    totals: run.totals,
    roster: run.roster,
    next_patron: run.next_patron,
    stock: run.stock,
    staff_left: run.staff_left,
    police_left: run.police_left,
  };
}

export function load_run(saved: SavedRun): Run {
  return {
    ...create_run(),
    phase: Phase.DAY_OVER,
    day: saved.day,
    money: saved.money,
    jail_days: saved.jail_days,
    days_survived: saved.days_survived,
    sale: saved.sale,
    totals: saved.totals,
    roster: saved.roster,
    next_patron: saved.next_patron,
    stock: { ...full_stock(), ...saved.stock },
    staff_left: saved.staff_left,
    police_left: saved.police_left,
  };
}

export const best_run_schema = z.object({
  money: z.number().int().nonnegative(),
  days: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
});
export type BestRun = z.infer<typeof best_run_schema>;

export const NO_BEST: BestRun = { money: 0, days: 0, accuracy: 0 };

export function run_summary(run: Run): BestRun {
  return { money: Math.max(0, run.money), days: run.days_survived, accuracy: accuracy(run.totals) };
}

export function better_run(candidate: BestRun, best: BestRun): boolean {
  return candidate.money > best.money || (candidate.money === best.money && candidate.days > best.days);
}

export const SPOTLESS_FROM_DAY = 5;

export function spotless_day(run: Run): boolean {
  const { today } = run;
  return run.day >= SPOTLESS_FROM_DAY && !run.jailed && today.served > 0 && today.wrong === 0;
}
