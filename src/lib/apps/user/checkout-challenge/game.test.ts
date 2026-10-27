import { create_rng } from "$lib/core/utils/random";
import { describe, expect, test } from "vitest";
import {
  accept_mistake,
  append_key,
  arrival_gap,
  backspace,
  better_run,
  spotless_day,
  SPOTLESS_FROM_DAY,
  create_customer,
  create_run,
  DAY_MS,
  difficulty,
  DISPUTE_MS,
  enter,
  FIRST_ARRIVAL_MS,
  format_amount,
  LEAVE_MS,
  Mood,
  MAX_CLOSURES,
  MAX_HEALTH,
  MISTAKE_DAMAGE,
  open_day,
  parse_amount,
  Phase,
  scan,
  scan_next,
  scanned_total,
  SORRY_DAMAGE,
  sorry,
  Stage,
  stars,
  STREAK_FOR_SORRY,
  tick,
  type_key,
  type Run,
} from "./game";

const rng = create_rng(42);

function at_counter(run: Run = open_day(create_run())): Run {
  return tick(run, FIRST_ARRIVAL_MS, rng);
}

function scan_all(run: Run): Run {
  let next = run;
  while (next.customer?.items.some((item) => !item.scanned)) next = scan_next(next);
  return next;
}

function type_text(run: Run, text: string): Run {
  return [...text].reduce(type_key, run);
}

function ring(run: Run, text: string): Run {
  return enter(type_text(scan_all(run), text));
}

function total_text(run: Run): string {
  return format_amount(scanned_total(run.customer!), true);
}

function wrong_text(run: Run): string {
  return format_amount(scanned_total(run.customer!) + 100, true);
}

function leave(run: Run): Run {
  return tick(run, LEAVE_MS, rng);
}

describe("amounts", () => {
  test("format shows whole numbers until prices have cents", () => {
    expect(format_amount(1200, false)).toBe("12");
    expect(format_amount(1205, false)).toBe("12.05");
    expect(format_amount(1200, true)).toBe("12.00");
    expect(format_amount(7, true)).toBe("0.07");
  });

  test("parse reads the same amount however it's written", () => {
    expect(parse_amount("12")).toBe(1200);
    expect(parse_amount("12.5")).toBe(1250);
    expect(parse_amount("12.50")).toBe(1250);
    expect(parse_amount(".5")).toBe(50);
    expect(parse_amount("")).toBeNull();
    expect(parse_amount(".")).toBeNull();
  });

  test("typing keeps one dot and two decimals", () => {
    expect(append_key("12", ".")).toBe("12.");
    expect(append_key("12.", ".")).toBe("12.");
    expect(append_key("12.34", "5")).toBe("12.34");
    expect(append_key("0", "5")).toBe("5");
    expect(append_key("1", "x")).toBe("1");
  });
});

describe("customers", () => {
  test("difficulty grows with the days", () => {
    const first = difficulty(1);
    const later = difficulty(9);
    expect(first.cents).toBe(false);
    expect(later.cents).toBe(true);
    expect(later.max_items).toBeGreaterThan(first.max_items);
    expect(later.max_cents).toBeGreaterThan(first.max_cents);
  });

  test("whole-number days price in whole units", () => {
    const random = create_rng(1);
    for (let i = 0; i < 50; i++) {
      for (const item of create_customer(i, 1, MAX_HEALTH, random).items) expect(item.cents % 100).toBe(0);
    }
  });

  test("low health brings fewer, cheaper items and longer waits", () => {
    const spent = (health: number) => {
      const random = create_rng(5);
      let items = 0;
      let money = 0;
      for (let i = 0; i < 300; i++) {
        const customer = create_customer(i, 8, health, random);
        items += customer.items.length;
        money += customer.items.reduce((sum, item) => sum + item.cents, 0);
      }
      return { items, money };
    };
    const full = spent(MAX_HEALTH);
    const low = spent(10);
    expect(low.items).toBeLessThan(full.items);
    expect(low.money).toBeLessThan(full.money);
    expect(arrival_gap(10, () => 0.5)).toBeGreaterThan(arrival_gap(MAX_HEALTH, () => 0.5));
  });
});

describe("a sale", () => {
  test("the first customer arrives after opening", () => {
    const run = open_day(create_run());
    expect(run.phase).toBe(Phase.OPEN);
    expect(run.customer).toBeNull();
    expect(at_counter(run).customer).not.toBeNull();
  });

  test("scanning adds to the running total", () => {
    const run = at_counter();
    const first = scan(run, 0);
    expect(scanned_total(first.customer!)).toBe(run.customer!.items[0].cents);
    expect(scan(first, 0)).toBe(first);
    if (run.customer!.items.length > 1) expect(scan(first, 1).customer!.receipt).toEqual([0, 1]);
  });

  test("Enter waits until every item is scanned", () => {
    const run = at_counter();
    const total = format_amount(run.customer!.items.reduce((sum, item) => sum + item.cents, 0), true);
    const typed = type_text(run, total);
    const after = enter(typed);
    expect(after.customer!.stage).toBe(Stage.RINGING);
    expect(after.unscanned).not.toBeNull();
  });

  test("the right total pays, cheers and heals", () => {
    const run = at_counter({ ...open_day(create_run()), health: 50 });
    const after = ring(run, total_text(scan_all(run)));
    expect(after.customer!.mood).toBe(Mood.HAPPY);
    expect(after.money).toBe(scanned_total(after.customer!));
    expect(after.health).toBeGreaterThan(50);
    expect(after.today.clean).toBe(1);
  });

  test("Backspace edits the typed amount", () => {
    const run = type_text(scan_all(at_counter()), "123");
    expect(backspace(run).typed).toBe("12");
  });

  test("a wrong total with a token waits for Sorry, then costs half on a right retype", () => {
    const run = scan_all(at_counter());
    const disputed = ring(run, wrong_text(run));
    expect(disputed.customer!.stage).toBe(Stage.DISPUTED);
    expect(disputed.customer!.mood).toBe(Mood.SAD);
    expect(disputed.health).toBe(MAX_HEALTH);

    const retyping = sorry(disputed);
    expect(retyping.sorry_tokens).toBe(run.sorry_tokens - 1);
    expect(retyping.typed).toBe("");
    const after = enter(type_text(retyping, total_text(run)));
    expect(after.customer!.mood).toBe(Mood.MEH);
    expect(after.health).toBe(MAX_HEALTH - SORRY_DAMAGE);
    expect(after.today.sorry).toBe(1);
    expect(after.money).toBe(scanned_total(run.customer!));
  });

  test("a wrong retype after Sorry costs the full damage", () => {
    const run = scan_all(at_counter());
    const after = enter(type_text(sorry(ring(run, wrong_text(run))), wrong_text(run)));
    expect(after.customer!.mood).toBe(Mood.SAD);
    expect(after.health).toBe(MAX_HEALTH - MISTAKE_DAMAGE);
    expect(after.money).toBe(0);
  });

  test("an unanswered dispute becomes a mistake", () => {
    const run = scan_all(at_counter());
    const disputed = ring(run, wrong_text(run));
    const waited = tick(disputed, DISPUTE_MS, rng);
    expect(waited.customer!.stage).toBe(Stage.DONE);
    expect(waited.health).toBe(MAX_HEALTH - MISTAKE_DAMAGE);
    expect(accept_mistake(disputed).today.mistakes).toBe(1);
  });

  test("without a token a wrong total is a mistake at once", () => {
    const run = scan_all(at_counter({ ...open_day(create_run()), sorry_tokens: 0 }));
    const after = ring(run, wrong_text(run));
    expect(after.customer!.stage).toBe(Stage.DONE);
    expect(after.today.mistakes).toBe(1);
  });

  test("a streak of clean sales earns a Sorry token", () => {
    let run: Run = { ...open_day(create_run()), sorry_tokens: 0 };
    for (let i = 0; i < STREAK_FOR_SORRY; i++) {
      run = at_counter(run);
      run = scan_all(run);
      run = leave(ring(run, total_text(run)));
      run = tick(run, 10_000, rng);
    }
    expect(run.sorry_tokens).toBe(1);
  });
});

describe("days", () => {
  test("the day ends after a minute", () => {
    const run = tick(open_day(create_run()), DAY_MS + 1, rng);
    expect(run.phase).toBe(Phase.DAY_OVER);
    expect(run.days_survived).toBe(1);
    const next = open_day(run);
    expect(next.day).toBe(2);
  });

  test("empty health closes the shop early; three closures lose it", () => {
    let run: Run = create_run();
    for (let closure = 1; closure <= MAX_CLOSURES; closure++) {
      run = at_counter({ ...open_day(run), health: MISTAKE_DAMAGE, sorry_tokens: 0 });
      run = scan_all(run);
      run = leave(ring(run, wrong_text(run)));
      expect(run.closures).toBe(closure);
      expect(run.phase).toBe(closure === MAX_CLOSURES ? Phase.GAME_OVER : Phase.DAY_OVER);
    }
    expect(open_day(run)).toBe(run);
  });

  test("a closure refills health for the next day", () => {
    let run = at_counter({ ...open_day(create_run()), health: MISTAKE_DAMAGE, sorry_tokens: 0 });
    run = leave(ring(scan_all(run), wrong_text(scan_all(run))));
    expect(open_day(run).health).toBe(MAX_HEALTH);
  });

  test("stars follow accuracy, capped at one after a closure", () => {
    expect(stars({ clean: 10, sorry: 0, mistakes: 0, money: 0 }, false)).toBe(3);
    expect(stars({ clean: 8, sorry: 0, mistakes: 2, money: 0 }, false)).toBe(2);
    expect(stars({ clean: 6, sorry: 2, mistakes: 2, money: 0 }, false)).toBe(1);
    expect(stars({ clean: 1, sorry: 0, mistakes: 3, money: 0 }, false)).toBe(0);
    expect(stars({ clean: 10, sorry: 0, mistakes: 0, money: 0 }, true)).toBe(1);
    expect(stars({ clean: 0, sorry: 0, mistakes: 0, money: 0 }, false)).toBe(0);
  });

  test("the best run is the richest, days break a tie", () => {
    expect(better_run({ money: 10, days: 1, accuracy: 1 }, { money: 5, days: 4, accuracy: 1 })).toBe(true);
    expect(better_run({ money: 10, days: 2, accuracy: 0 }, { money: 10, days: 1, accuracy: 1 })).toBe(true);
    expect(better_run({ money: 10, days: 1, accuracy: 1 }, { money: 10, days: 1, accuracy: 0 })).toBe(false);
  });
});

describe("spotless_day", () => {
  const day = (day: number, today: Partial<ReturnType<typeof create_run>["today"]>, closed_early = false) => {
    const run = create_run();
    return { ...run, day, closed_early, today: { ...run.today, ...today } };
  };

  test("takes a clean day from day 5 on", () => {
    expect(spotless_day(day(SPOTLESS_FROM_DAY, { clean: 12 }))).toBe(true);
    expect(spotless_day(day(SPOTLESS_FROM_DAY - 1, { clean: 12 }))).toBe(false);
  });

  test("not with a sorry, a mistake, no sales or an early close", () => {
    expect(spotless_day(day(6, { clean: 12, sorry: 1 }))).toBe(false);
    expect(spotless_day(day(6, { clean: 12, mistakes: 1 }))).toBe(false);
    expect(spotless_day(day(6, {}))).toBe(false);
    expect(spotless_day(day(6, { clean: 12 }, true))).toBe(false);
  });
});
