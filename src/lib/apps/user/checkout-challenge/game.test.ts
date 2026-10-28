import { create_rng } from "$lib/core/utils/random";
import { describe, expect, test } from "vitest";
import {
  append_key,
  ARRIVAL_MS,
  begin_day,
  better_run,
  bills,
  can_hire,
  choose_patron,
  create_run,
  current_item,
  day_customers,
  difficulty,
  DIGITS,
  enter,
  entered_total,
  FIRST_CUSTOMERS,
  format_amount,
  hire_staff,
  LEAVE_MS,
  list_total,
  load_run,
  LOW_TRUST,
  mask,
  MAX_CUSTOMERS,
  MAX_JAIL_DAYS,
  MAX_TRUST,
  Mood,
  parse_amount,
  Phase,
  PRODUCT_CODES,
  PRODUCTS,
  REPORT_STRIKES,
  restock_key,
  save_run,
  saved_run_schema,
  spotless_day,
  SPOTLESS_FROM_DAY,
  STAFF_CUSTOMERS,
  staff_price,
  Stage,
  START_TRUST,
  stars,
  STOCK_FULL,
  tick,
  toggle_sale,
  TRUST_GAIN,
  TRUST_LOSS,
  type_key,
  warm_key,
  type Run,
} from "./game";

const rng = create_rng(42);

function warmed(run: Run): Run {
  return run.warmup.reduce(warm_key, run);
}

function open(run: Run = create_run()): Run {
  return warmed(begin_day(run, rng));
}

function at_counter(run: Run = open()): Run {
  return tick(run, ARRIVAL_MS, rng);
}

function type_text(run: Run, text: string): Run {
  return [...text].reduce(type_key, run);
}

function enter_text(run: Run, text: string): Run {
  return enter(type_text(run, text), rng);
}

const money = (cents: number) => format_amount(cents, true);

function enter_items(run: Run, wrong = false): Run {
  let next = run;
  while (next.customer?.stage === Stage.ITEMS) {
    const item = next.customer.items[current_item(next.customer)];
    next = enter_text(next, money(item.cents + (wrong ? 100 : 0)));
    wrong = false;
  }
  return next;
}

function serve(run: Run, right = true): Run {
  let next = enter_items(run);
  const total = list_total(next.customer!);
  const text = money(right ? total : total + 100);
  next = enter_text(next, text);
  if (next.customer?.stage === Stage.CONFIRM) next = enter_text(next, text);
  return next;
}

function leave(run: Run): Run {
  return tick(run, LEAVE_MS, rng);
}

function next_customer(run: Run): Run {
  return tick(leave(run), ARRIVAL_MS, rng);
}

function patron_of(run: Run) {
  return run.roster.find((patron) => patron.id === run.customer!.patron)!;
}

function with_trust(run: Run, trust: number): Run {
  const id = run.customer!.patron;
  return {
    ...run,
    roster: run.roster.map((patron) => (patron.id === id ? { ...patron, trust } : patron)),
    customer: { ...run.customer!, doubting: trust < LOW_TRUST },
  };
}

function as_patron(run: Run, id: number): Run {
  const patron = run.roster.find((entry) => entry.id === id)!;
  return { ...run, customer: { ...run.customer!, patron: id, doubting: patron.trust < LOW_TRUST } };
}

function restocked(run: Run): Run {
  let next = run;
  for (const product of [...next.restock]) next = [...PRODUCT_CODES[product]].reduce(restock_key, next);
  return next;
}

function reload(run: Run): Run {
  return load_run(saved_run_schema.parse(JSON.parse(JSON.stringify(save_run(run)))));
}

describe("amounts", () => {
  test("format shows whole numbers until prices have cents", () => {
    expect(format_amount(1200, false)).toBe("12");
    expect(format_amount(1205, false)).toBe("12.05");
    expect(format_amount(1200, true)).toBe("12.00");
    expect(format_amount(-250, true)).toBe("-2.50");
  });

  test("parse reads the same amount however it's written", () => {
    expect(parse_amount("12")).toBe(1200);
    expect(parse_amount("12.5")).toBe(1250);
    expect(parse_amount(".5")).toBe(50);
    expect(parse_amount("")).toBeNull();
    expect(parse_amount(".")).toBeNull();
  });

  test("typing keeps one dot and two decimals", () => {
    expect(append_key("12.", ".")).toBe("12.");
    expect(append_key("12.34", "5")).toBe("12.34");
    expect(append_key("0", "5")).toBe("5");
  });

  test("blind mode hides digits and keeps the point", () => {
    expect(mask("12.50")).toBe("**.**");
    expect(mask("7")).toBe("*");
  });
});

describe("days", () => {
  test("customers per day grow from the first day to a cap", () => {
    expect(day_customers(1)).toBe(FIRST_CUSTOMERS);
    expect(day_customers(2)).toBe(FIRST_CUSTOMERS + 1);
    expect(day_customers(40)).toBe(MAX_CUSTOMERS);
  });

  test("difficulty grows with the days", () => {
    expect(difficulty(1).cents).toBe(false);
    expect(difficulty(9).cents).toBe(true);
    expect(difficulty(9).max_cents).toBeGreaterThan(difficulty(1).max_cents);
  });

  test("the warm-up lights every digit once, in random order, then the shop opens", () => {
    const run = begin_day(create_run(), rng);
    expect(run.phase).toBe(Phase.WARMUP);
    expect([...run.warmup].sort()).toEqual([...DIGITS]);
    const wrong = DIGITS.find((digit) => digit !== run.warmup[0])!;
    const missed = warm_key(run, wrong);
    expect(missed.warmup).toEqual(run.warmup);
    expect(missed.warm_miss).not.toBeNull();
    const nine = run.warmup.slice(0, 9).reduce(warm_key, run);
    expect(nine.phase).toBe(Phase.WARMUP);
    expect(warm_key(nine, run.warmup[9]).phase).toBe(Phase.OPEN);
  });

  test("a day has no clock: it ends when its last customer leaves", () => {
    let run = at_counter();
    expect(tick(run, 10 * 60_000, rng).phase).toBe(Phase.OPEN);
    for (let served = 1; served < day_customers(1); served++) run = next_customer(serve(run));
    run = leave(serve(run));
    expect([Phase.RESTOCK, Phase.DAY_OVER]).toContain(run.phase);
    expect(run.today.served).toBe(day_customers(1));
    expect(run.days_survived).toBe(1);
  });
});

describe("the typed list", () => {
  test("each Enter enters the next price, crosses it off and adds it to the running total", () => {
    let run = at_counter();
    const customer = run.customer!;
    expect(customer.stage).toBe(Stage.ITEMS);
    run = enter_text(run, "1");
    expect(run.customer!.items[0].entered).toBe(100);
    expect(entered_total(run.customer!)).toBe(100);
    expect(run.typed).toBe("");
  });

  test("an empty Enter does nothing", () => {
    const run = at_counter();
    expect(enter(run, rng)).toBe(run);
  });

  test("a right total is a sale and earns the customer's trust", () => {
    let run = at_counter();
    const total = list_total(run.customer!);
    run = serve(run);
    expect(run.customer!.stage).toBe(Stage.DONE);
    expect(run.customer!.result).toEqual({ given: total, total });
    expect(run.customer!.mood).toBe(Mood.HAPPY);
    expect(run.money).toBe(total);
    expect(patron_of(run).trust).toBe(START_TRUST + TRUST_GAIN);
  });

  test("a wrong price only shows when the total is given, as over", () => {
    let run = enter_items(at_counter(), true);
    expect(run.customer!.stage).toBe(Stage.TOTAL);
    const shown = entered_total(run.customer!);
    run = enter_text(run, money(shown));
    expect(run.customer!.result!.given - run.customer!.result!.total).toBe(100);
    expect(run.money).toBe(0);
    expect(patron_of(run).trust).toBe(START_TRUST - TRUST_LOSS);
    expect(run.today.wrong).toBe(1);
  });

  test("staff scan the list: only the total is typed", () => {
    let run = { ...at_counter(), money: staff_price(1) };
    expect(can_hire(run)).toBe(true);
    run = hire_staff(run);
    expect(run.money).toBe(0);
    expect(run.today.wages).toBe(staff_price(1));
    expect(can_hire(run)).toBe(false);
    run = next_customer(serve(run));
    expect(run.customer!.staffed).toBe(true);
    expect(run.customer!.stage).toBe(Stage.TOTAL);
    expect(run.staff_left).toBe(STAFF_CUSTOMERS - 1);
  });
});

describe("trust and the police", () => {
  test("a low-trust customer wants the total twice; either slip is wrong", () => {
    let run = with_trust(enter_items(at_counter()), LOW_TRUST - 1);
    const total = list_total(run.customer!);
    run = enter_text(run, money(total + 1));
    expect(run.customer!.stage).toBe(Stage.CONFIRM);
    run = enter_text(run, money(total));
    expect(run.customer!.result!.given).toBe(total + 1);
    expect(patron_of(run).strikes).toBe(1);
  });

  test(`${REPORT_STRIKES} slips with a doubting customer bring the police, who watch blind and jail the next slip`, () => {
    let run = with_trust(at_counter(), LOW_TRUST - 1);
    const id = run.customer!.patron;
    run = {
      ...run,
      roster: run.roster.map((patron) => (patron.id === id ? { ...patron, strikes: REPORT_STRIKES - 1 } : patron)),
    };
    run = serve(run, false);
    expect(run.police_left).toBeGreaterThan(0);
    expect(run.customer!.mood).toBe(Mood.VEXED);
    run = next_customer(run);
    expect(run.customer!.mood).toBe(Mood.VEXED);
    run = serve(run, false);
    expect(run.jailed).toBe(true);
    expect(run.jail_days).toBe(1);
    run = leave(run);
    expect(run.phase === Phase.RESTOCK || run.phase === Phase.DAY_OVER).toBe(true);
    expect(stars(run.today, run.jailed)).toBeLessThanOrEqual(1);
  });

  test("a new patron short-changed three times calls the police", () => {
    let run = at_counter();
    const id = run.customer!.patron;
    expect(patron_of(run).trust).toBe(START_TRUST);
    run = serve(run, false);
    expect(patron_of(run).strikes).toBe(0);
    run = serve(as_patron(next_customer(run), id), false);
    expect(patron_of(run).strikes).toBe(1);
    expect(run.police_left).toBe(0);
    run = serve(as_patron(next_customer(run), id), false);
    expect(run.police_left).toBeGreaterThan(0);
    expect(run.reported).not.toBeNull();
  });

  test("right sales in between don't wash the strikes out", () => {
    let run = serve(at_counter(), false);
    const id = run.customer!.patron;
    run = serve(as_patron(next_customer(run), id), false);
    run = serve(as_patron(next_customer(run), id));
    run = serve(as_patron(next_customer(run), id));
    expect(patron_of(run).trust).toBeGreaterThan(0);
    expect(run.police_left).toBe(0);
    run = serve(as_patron(next_customer(run), id), false);
    expect(run.police_left).toBeGreaterThan(0);
  });

  test("the police watch carries into the next day and the save", () => {
    let run = { ...at_counter(), police_left: 1 };
    for (let served = 1; served < day_customers(1); served++) run = next_customer(serve({ ...run, police_left: 0 }));
    run = leave(serve({ ...run, police_left: 0 }));
    run = restocked({ ...run, police_left: 3 });
    expect(run.phase).toBe(Phase.DAY_OVER);
    const loaded = reload(run);
    expect(loaded.police_left).toBe(3);
    run = at_counter(open(loaded));
    expect(run.day).toBe(2);
    expect(run.police_left).toBe(3);
    expect(run.customer!.mood).toBe(Mood.VEXED);
  });

  test("right sales while watched send the police away", () => {
    let run = { ...at_counter(), police_left: 1 };
    run = serve(run);
    expect(run.police_left).toBe(0);
    expect(run.today.cleared).toBe(1);
  });

  test(`${MAX_JAIL_DAYS} days in jail close the shop`, () => {
    let run = { ...at_counter(), police_left: 2, jail_days: MAX_JAIL_DAYS - 1 };
    run = leave(serve(run, false));
    expect(run.phase).toBe(Phase.GAME_OVER);
  });

  test("regulars come back, the trusting ones more often", () => {
    const base = create_run();
    const roster = [
      { id: 1, name: "Mia", tag: null, look: 0, ears: 0, trust: MAX_TRUST, visits: 3, strikes: 0 },
      { id: 2, name: "Leo", tag: null, look: 0, ears: 0, trust: 5, visits: 3, strikes: 0 },
    ];
    const run = { ...base, roster, next_patron: 3 };
    const random = create_rng(7);
    const counts = { 1: 0, 2: 0, new: 0 };
    for (let i = 0; i < 2000; i++) {
      const visit = choose_patron(run, random);
      if (!visit.returning) counts.new++;
      else counts[visit.patron.id as 1 | 2]++;
    }
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts.new).toBeGreaterThan(counts[1]);
    const on_sale = { ...run, sale: true };
    let returning = 0;
    for (let i = 0; i < 2000; i++) if (choose_patron(on_sale, random).returning) returning++;
    expect(returning).toBeGreaterThan(counts[1] + counts[2]);
  });

  test("namesakes get a number to tell them apart", () => {
    const random = create_rng(3);
    let run: Run = create_run();
    for (let i = 0; i < 60; i++) {
      const visit = choose_patron({ ...run, roster: run.roster, sale: false }, random);
      run = { ...run, roster: visit.roster, next_patron: visit.next_patron };
    }
    const names = new Map<string, number>();
    for (const patron of run.roster) names.set(patron.name, (names.get(patron.name) ?? 0) + 1);
    for (const patron of run.roster) {
      if ((names.get(patron.name) ?? 0) > 1) expect(patron.tag).not.toBeNull();
    }
    const labels = run.roster.map((patron) => `${patron.name}${patron.tag ?? ""}`);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("end of day", () => {
  function day_done(): Run {
    let run = at_counter();
    for (let served = 1; served < day_customers(1); served++) run = next_customer(serve(run));
    return leave(serve(run));
  }

  test("the books take bills and stock out of the takings", () => {
    const run = day_done();
    expect(run.books).not.toBeNull();
    expect(run.books!.bills).toBe(bills(1));
    expect(run.money).toBe(run.books!.takings - run.books!.bills - run.books!.stock);
  });

  test("restock clears a line per code, no Enter; a wrong code is only a miss", () => {
    let run = day_done();
    expect(run.phase).toBe(Phase.RESTOCK);
    const first = run.restock[0];
    const code = PRODUCT_CODES[first];
    const bad = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].find(
      (digit) => !run.restock.some((product) => PRODUCT_CODES[product].startsWith(digit))
    );
    if (bad) {
      const missed = restock_key(run, bad);
      expect(missed.code).toBe("");
      expect(missed.code_miss).not.toBeNull();
      expect(missed.restock).toEqual(run.restock);
    }
    run = restock_key(restock_key(run, code[0]), code[1]);
    expect(run.restock).not.toContain(first);
    expect(run.stock[first]).toBe(STOCK_FULL);
    for (const product of [...run.restock]) run = [...PRODUCT_CODES[product]].reduce(restock_key, run);
    expect(run.phase).toBe(Phase.DAY_OVER);
    expect(PRODUCTS.every((product) => run.stock[product] === STOCK_FULL)).toBe(true);
  });

  test("staff paid for keep working the next day, through the save", () => {
    let run = at_counter();
    for (let served = 1; served < day_customers(1) - 1; served++) run = next_customer(serve(run));
    run = hire_staff({ ...run, money: staff_price(1) });
    expect(run.staff_left).toBe(STAFF_CUSTOMERS);
    run = next_customer(serve(run));
    expect(run.customer!.staffed).toBe(true);
    run = restocked(leave(serve(run)));
    expect(run.phase).toBe(Phase.DAY_OVER);
    expect(run.staff_left).toBe(STAFF_CUSTOMERS - 1);
    run = at_counter(open(reload(run)));
    expect(run.customer!.staffed).toBe(true);
    expect(run.staff_left).toBe(STAFF_CUSTOMERS - 2);
  });

  test("a save from before staff and police were kept reads as none", () => {
    const old: Record<string, unknown> = { ...save_run(create_run()) };
    delete old.staff_left;
    delete old.police_left;
    const loaded = load_run(saved_run_schema.parse(old));
    expect(loaded.staff_left).toBe(0);
    expect(loaded.police_left).toBe(0);
  });

  test("codes are distinct and two digits", () => {
    const codes = Object.values(PRODUCT_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^\d\d$/);
  });

  test("the run saves between days and continues on the next day", () => {
    let run = day_done();
    for (const product of [...run.restock]) run = [...PRODUCT_CODES[product]].reduce(restock_key, run);
    run = toggle_sale(run);
    const saved = saved_run_schema.parse(JSON.parse(JSON.stringify(save_run(run))));
    const loaded = load_run(saved);
    expect(loaded.phase).toBe(Phase.DAY_OVER);
    expect(loaded.roster).toEqual(run.roster);
    expect(loaded.money).toBe(run.money);
    expect(loaded.sale).toBe(true);
    const next = begin_day(loaded, rng);
    expect(next.day).toBe(2);
    expect(next.phase).toBe(Phase.WARMUP);
  });

  test("spotless needs day 5 on, no slips and no jail", () => {
    const run = { ...create_run(), day: SPOTLESS_FROM_DAY, today: { ...create_run().today, served: 4, right: 4 } };
    expect(spotless_day(run)).toBe(true);
    expect(spotless_day({ ...run, jailed: true })).toBe(false);
    expect(spotless_day({ ...run, day: SPOTLESS_FROM_DAY - 1 })).toBe(false);
  });

  test("the best run is the most cash, then the most days", () => {
    expect(better_run({ money: 10, days: 1, accuracy: 1 }, { money: 5, days: 9, accuracy: 1 })).toBe(true);
    expect(better_run({ money: 5, days: 2, accuracy: 1 }, { money: 5, days: 1, accuracy: 1 })).toBe(true);
    expect(better_run({ money: 5, days: 1, accuracy: 1 }, { money: 5, days: 1, accuracy: 1 })).toBe(false);
  });
});
