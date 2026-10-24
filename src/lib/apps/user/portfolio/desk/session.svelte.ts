import { PRINCIPLES } from "../content/principles";
import { EVIDENCE, SHOWN } from "./evidence";
import { ActionKind, COMMAND_OF, help_for, parse, PHONE_PRINCIPLE_BEAT, PRINCIPLE_BEAT, reply, RowLayout, summary, TOUR, TOUR_PRINCIPLES, WINDOWS, Win } from "./script";
import { search, type Hit } from "./search";

export const Tone = { OUT: "out", DIM: "dim", ERROR: "error" } as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

export interface Line {
  tone: Tone;
  text: string;
  detail?: string;
  short?: string;
  run?: string;
  principle?: string;
  hit?: Hit;
  query?: string;
  layout?: RowLayout;
}

export interface Entry {
  id: number;
  input: string | null;
  lines: Line[];
  tour: boolean;
  /** The command moved the page to its answer, so a phone shows no sheet over it. */
  navigated: boolean;
}

export const TourState = { PLAYING: "playing", PAUSED: "paused", DONE: "done" } as const;
export type TourState = (typeof TourState)[keyof typeof TourState];

export interface Entrance {
  delay: number;
  scroll: boolean;
  /** The first window on a phone is simply there: the name shows with the page. */
  still: boolean;
  invited: boolean;
}

interface Point {
  x: number;
  y: number;
}

const MAX_ENTRIES = 60;
const STAGGER = 110;
const ALL_PRINCIPLES = PRINCIPLES.map((principle) => principle.id);

export class PortfolioSession {
  public log = $state<Entry[]>([]);
  public history = $state<string[]>([]);
  public typed = $state("");
  public tour = $state<TourState>(TourState.PLAYING);
  public step = $state(0);
  public open = $state<string[]>([]);
  public order = $state<string[]>([]);
  public moved = $state<Record<string, Point>>({});
  /** The window being dragged right now: it leaves its slot's shadow and casts its own. */
  public held = $state<string | null>(null);
  public lit = $state<string | null>(null);
  public cycling = $state(false);
  public reveal = $state(0);
  public job = $state<string | null>(null);
  public project = $state<string | null>(null);
  public pulses = $state<Record<string, number>>({});
  /** A principle pointed at or focused in How I build, not yet lit: Who I am's logo previews its glyph. */
  public peek = $state<string | null>(null);
  /** Contact's draft: kept across close and reopen, and `mail "…"` fills the subject. */
  public subject = $state("");
  public message = $state("");
  public stacked = $state(false);
  /** Who I am's name is in view; on a phone the terminal header shows it while it isn't. */
  public named = $state(true);
  /** The tour step holding the screen right now, so a window can play its part of it (the phone's project carousel). */
  public beat = $state<string | null>(null);
  public coarse = false;
  /** `leaving`: the windows the change closes, which the transition has to treat apart. */
  public morph: ((change: () => void, leaving: string[]) => Promise<void>) | null = null;
  public landing: Promise<void> = Promise.resolve();
  public hold_for: (line: string) => number | undefined = () => undefined;
  private passing: Promise<void> | null = null;

  private readonly reduced: boolean;
  private readonly entrances = new Map<string, Entrance>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private next_id = 0;
  private shown_once = false;
  private quiet = false;
  private touring = false;
  private token = 0;
  private cycle_token = 0;

  constructor(reduced: boolean) {
    this.reduced = reduced;
  }

  public start(): void {
    if (this.reduced) this.finish();
    else void this.play(0);
  }

  /** On the desktop Contact floats over the desk, so a link opens it only when it is the window asked for. */
  public start_at(id: string): void {
    this.quietly(() => {
      for (const { line } of TOUR) if (line !== COMMAND_OF[Win.CONTACT] || this.stacked || id === Win.CONTACT) this.run(line);
    });
    const entrance = this.entrances.get(id);
    if (entrance && id === Win.CONTACT) entrance.invited = true;
    this.raise(id);
    this.step = TOUR.length;
    this.tour = TourState.DONE;
  }

  public destroy(): void {
    this.token++;
    this.cycle_token++;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }

  public is_open(id: string): boolean {
    return this.open.includes(id);
  }

  public take_entrance(id: string): Entrance | undefined {
    const entrance = this.entrances.get(id);
    this.entrances.delete(id);
    return entrance;
  }

  private raise(id: string): void {
    if (this.order.at(-1) === id) return;
    this.order = [...this.order.filter((other) => other !== id), id];
  }

  public focus(id: string): void {
    this.raise(id);
  }

  public move(id: string, to: Point): void {
    this.moved = { ...this.moved, [id]: to };
  }

  public dismiss(id: string): void {
    if (this.floats(id)) return this.close(id);
    this.change(() => this.close(id), [id]);
  }

  private floats(id: string): boolean {
    return id === Win.CONTACT && !this.stacked;
  }

  public close(id: string): void {
    this.open = this.open.filter((other) => other !== id);
    this.order = this.order.filter((other) => other !== id);
    const { [id]: _, ...rest } = this.moved;
    this.moved = rest;
  }

  public light(principle: string | null): void {
    const pinned = !this.cycling && this.lit === principle;
    this.cycle_token++;
    this.cycling = false;
    this.lit = pinned ? null : principle;
    if (this.lit === null) return;
    this.evidence_windows(this.lit).forEach((id) => this.raise(id));
    this.reveal++;
    // A principle no card labels still points somewhere: the place its proof names is brought in and flashed, unlit.
    const shown = SHOWN[this.lit];
    const named = EVIDENCE[this.lit];
    // A phone keeps the reader on the proof that was just shown; yanking the page to a card would lose it.
    if (this.stacked || !shown || !named || shown.jobs.length + shown.projects.length > 0) return;
    if (named.projects[0] && this.is_open(Win.PROJECTS)) {
      this.project = named.projects[0];
      this.pulse(Win.PROJECTS);
    } else if (named.jobs[0] && this.is_open(Win.TIMELINE)) {
      this.job = named.jobs[0];
      this.pulse(Win.TIMELINE);
    }
  }

  private evidence_windows(principle: string): string[] {
    const evidence = SHOWN[principle];
    if (!evidence) return [];
    const windows: string[] = [];
    if (evidence.jobs.length > 0) windows.push(Win.TIMELINE);
    if (evidence.projects.length > 0) windows.push(Win.PROJECTS);
    return windows.filter((id) => this.is_open(id));
  }

  /**
   * A visitor who takes over gets every window at once, so nothing is left behind a resume: always on a phone, whose
   * tour scrolls a long page, and on the desktop when they start typing. Dragging a window only stops the tour.
   */
  public pause(compose = false): void {
    if (this.tour !== TourState.PLAYING) return;
    this.token++;
    this.typed = "";
    this.beat = null;
    this.cycle_token++;
    this.cycling = false;
    this.lit = null;
    if (this.stacked) this.open_rest();
    else if (compose) this.change(() => this.open_rest());
    // With every window open, resuming would only replay the principle pass: the visitor gets "replay", which says so.
    const whole = this.stacked || compose;
    this.tour = whole || this.next_step() >= TOUR.length ? TourState.DONE : TourState.PAUSED;
  }

  public resume(): void {
    if (this.tour === TourState.PAUSED) void this.play(this.step);
  }

  /** The next tour step that still has something to do: a visitor may have opened it themselves. */
  public next_step(from = this.step): number {
    let index = from;
    while (index < TOUR.length && this.opened(TOUR[index].line)) index++;
    return index;
  }

  public skip(): void {
    this.token++;
    this.typed = "";
    this.beat = null;
    const from = this.step;
    this.change(() => this.open_rest(from));
    this.step = TOUR.length;
    this.tour = TourState.DONE;
  }

  public replay(): void {
    this.token++;
    this.typed = "";
    this.beat = null;
    const leaving = [...this.open];
    this.change(() => {
      this.open = [];
      this.order = [];
      this.moved = {};
    }, leaving);
    this.log = [];
    this.cycle_token++;
    this.cycling = false;
    this.lit = null;
    this.job = null;
    this.project = null;
    this.step = 0;
    this.tour = TourState.PLAYING;
    this.start();
  }

  public submit(line: string): void {
    const trimmed = line.trim();
    if (trimmed && this.history[0] !== trimmed) this.history = [trimmed, ...this.history].slice(0, 50);
    this.run(trimmed);
  }

  public jump(hit: Hit, query: string, input = `/${query}`, before: Line[] = [], after: Line[] = []): void {
    if (hit.principle) {
      this.push(input, [...before, ...this.principle_lines([hit.principle]), ...after], true);
      if (this.cycling || this.lit !== hit.principle) this.light(hit.principle);
      if (this.stacked) this.pulse(Win.IDENTITY);
      return;
    }
    this.push(input, [...before, { tone: Tone.OUT, text: hit.label, detail: hit.detail || undefined, layout: RowLayout.BELOW }, ...after], true);
    if (hit.window) this.show([hit.window], { job: hit.job, project: hit.project });
  }

  public run(line: string): void {
    const action = parse(line);
    const touring = this.touring;
    switch (action.kind) {
      case ActionKind.NONE:
        this.push(line, []);
        return;
      case ActionKind.OPEN:
        this.push(
          line,
          (touring ? summary(action) : reply(action)).map((row) => ({ tone: Tone.OUT, ...row })),
          true
        );
        if (action.subject) this.subject = action.subject;
        this.show(action.windows, { job: action.job, project: action.project });
        return;
      case ActionKind.HOW:
        this.push(line, summary(action, touring).map((row) => ({ tone: Tone.OUT, ...row })), true);
        this.show([Win.HOW], {});
        if (action.principle) {
          if (this.cycling || this.lit !== action.principle) this.light(action.principle);
        } else if (!this.reduced && !this.quiet) this.passing = this.pass(touring ? TOUR_PRINCIPLES : ALL_PRINCIPLES);
        return;
      case ActionKind.CLOSE: {
        const closing = action.windows.filter((id) => this.is_open(id));
        const seen = closing.length;
        const close = () => closing.forEach((id) => this.close(id));
        if (closing.every((id) => this.floats(id))) close();
        else this.change(close, closing);
        this.push(line, [{ tone: Tone.DIM, text: seen === 0 ? "Nothing to close." : `Closed ${seen === 1 ? "1 window" : `${seen} windows`}.` }], this.open.length === 0);
        return;
      }
      case ActionKind.TOUR:
        this.replay();
        return;
      case ActionKind.TIDY:
        this.change(() => (this.moved = {}));
        this.push(line, [{ tone: Tone.DIM, text: "Every window is back in its place." }]);
        return;
      case ActionKind.CLEAR:
        this.log = [];
        return;
      case ActionKind.HELP:
        this.push(
          line,
          help_for(this.stacked)
            .map(
              (usage): Line => ({
                tone: Tone.OUT,
                text: `${usage.name} ${usage.args}`.trim(),
                detail: usage.about,
                run: `${usage.name}${usage.args.startsWith("--") ? ` ${usage.args}` : ""}`,
                layout: RowLayout.COLUMNS,
              })
            )
            .concat({
              tone: Tone.DIM,
              text: this.coarse ? "Search finds work, projects, skills and principles." : "Press / to search work, projects, skills and principles.",
            })
        );
        return;
      case ActionKind.LS:
        this.push(
          line,
          WINDOWS.map((id) => ({ tone: this.is_open(id) ? Tone.OUT : Tone.DIM, text: COMMAND_OF[id], detail: this.is_open(id) ? "open" : "closed", run: COMMAND_OF[id], layout: RowLayout.COLUMNS }))
        );
        return;
      case ActionKind.ERROR: {
        // A word that isn't a command is most likely a thing to find (`react`): it answers the way `/react` would.
        const hits = action.unknown && !action.suggest ? search(line) : [];
        if (hits.length > 0) {
          const [top, ...rest] = hits;
          const more = rest.slice(0, 2).map((hit): Line => ({ tone: Tone.OUT, text: hit.label, detail: hit.detail || undefined, hit, query: line, layout: RowLayout.BELOW }));
          const also: Line[] = more.length > 0 ? [{ tone: Tone.DIM, text: "Also found:" }, ...more] : [];
          this.jump(top, line, line, [{ tone: Tone.DIM, text: `Not a command, so I searched for it.` }], also);
          return;
        }
        this.push(line, [
          { tone: Tone.ERROR, text: action.text },
          action.suggest ? { tone: Tone.DIM, text: `Did you mean ${action.suggest}?`, run: action.suggest } : { tone: Tone.DIM, text: "Type help for the commands.", run: "help" },
        ]);
        return;
      }
    }
  }

  public opened(line: string): boolean {
    const action = parse(line);
    if (action.kind === ActionKind.HOW) return this.is_open(Win.HOW);
    return action.kind === ActionKind.OPEN && action.windows.every((id) => this.is_open(id));
  }

  /** Titles only; a principle with nothing open to point at carries its proof underneath instead. */
  private principle_lines(ids: string[]): Line[] {
    return PRINCIPLES.filter((p) => ids.includes(p.id)).map((principle): Line => {
      const shown = this.evidence_windows(principle.id).length > 0;
      return { tone: Tone.OUT, text: principle.title, principle: principle.id, detail: shown ? undefined : principle.proof };
    });
  }

  private async pass(ids: string[]): Promise<void> {
    const token = ++this.cycle_token;
    this.cycling = true;
    // The pass starts once How I build has landed: lighting the evidence and reshaping the logo during the re-tile would
    // move three things against each other.
    await this.landing;
    if (token !== this.cycle_token) return;
    for (const id of ids) {
      this.lit = id;
      await this.sleep(this.stacked ? PHONE_PRINCIPLE_BEAT : PRINCIPLE_BEAT);
      if (token !== this.cycle_token) return;
    }
    this.cycling = false;
    this.lit = null;
  }

  private pulse(id: string): void {
    this.pulses = { ...this.pulses, [id]: (this.pulses[id] ?? 0) + 1 };
  }

  private push(input: string | null, lines: Line[], navigated = false): void {
    this.log = [...this.log, { id: this.next_id++, input, lines, tour: this.touring, navigated }].slice(-MAX_ENTRIES);
  }

  private show(ids: string[], focus: { job?: string; project?: string }): void {
    this.cycle_token++;
    this.cycling = false;
    this.lit = null;
    // The first window of a visit is simply there, on the first frame, with no morph to wait for. A replay's first window
    // fades in instead, after the others have gone.
    const first = !this.shown_once;
    this.shown_once = true;
    const invited = !this.quiet && !this.touring;
    const apply = () => {
      if (ids.includes(Win.TIMELINE)) this.job = focus.job ?? null;
      if (ids.includes(Win.PROJECTS)) this.project = focus.project ?? null;
      const reading = [...ids].sort((a, b) => WINDOWS.indexOf(a) - WINDOWS.indexOf(b));
      let delay = 0;
      const still = this.open.length === 0 && this.step === 0;
      for (const id of reading) {
        if (this.is_open(id)) {
          this.raise(id);
          if (id === reading[0]) this.pulse(id);
          continue;
        }
        this.entrances.set(id, { delay, scroll: !this.quiet && !still && id === reading[0], still, invited });
        this.open = [...this.open, id];
        this.raise(id);
        delay += STAGGER;
      }
    };
    if (first) {
      this.landing = Promise.resolve();
      apply();
    } else if (ids.every((id) => this.floats(id))) apply();
    else this.change(apply);
  }

  /** Layout changes morph through a view transition on the stage; quiet runs, stacked and reduced motion apply at once. */
  private change(update: () => void, leaving: string[] = []): void {
    if (this.quiet || this.reduced || this.stacked || !this.morph) return update();
    this.landing = this.morph(update, leaving);
  }

  private quietly(run: () => void): void {
    this.quiet = true;
    this.touring = true;
    try {
      run();
    } finally {
      this.quiet = false;
      this.touring = false;
    }
  }

  /** Contact floats over the desk on the desktop, so taking over leaves it shut: it would dim the prompt the visitor is typing into. */
  private open_rest(from = this.step): void {
    this.quietly(() => {
      for (const { line } of TOUR.slice(from)) if (!this.opened(line) && (this.stacked || line !== COMMAND_OF[Win.CONTACT])) this.run(line);
    });
  }

  private finish(): void {
    this.open_rest(0);
    this.step = TOUR.length;
    this.tour = TourState.DONE;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        resolve();
      }, ms);
      this.timers.add(timer);
    });
  }

  private async play(from: number): Promise<void> {
    const token = ++this.token;
    const alive = () => token === this.token;
    this.tour = TourState.PLAYING;
    // A replay's close-all applies when its fade starts: which steps are left is known only after it, and a window
    // opened during it would cut the fade short.
    await this.landing;
    if (!alive()) return;
    for (let index = this.next_step(from); index < TOUR.length; index = this.next_step(index + 1)) {
      this.step = index;
      const { line } = TOUR[index];
      const hold = this.hold_for(line) ?? (this.stacked && parse(line).kind === ActionKind.HOW ? TOUR_PRINCIPLES.length * PHONE_PRINCIPLE_BEAT + 300 : TOUR[index].hold);
      const first = index === 0;
      // The page opens on the name at once: the first screen is the one most visitors judge it by, and a typing intro
      // over an empty page reads as loading.
      if (!first) {
        await this.sleep(index === from ? 700 : 250);
        if (!alive()) return;
        for (let length = 1; length <= line.length; length++) {
          this.typed = line.slice(0, length);
          await this.sleep(this.stacked ? 38 : 46 + ((length * 7) % 4) * 14);
          if (!alive()) return;
        }
        await this.sleep(340);
        if (!alive()) return;
      }
      this.typed = "";
      this.touring = true;
      try {
        this.run(line);
      } finally {
        this.touring = false;
      }
      this.step = index + 1;
      this.beat = line;
      const passing = this.passing;
      this.passing = null;
      if (passing) {
        await passing;
        if (alive()) await this.sleep(300);
      } else if (hold > 0) await this.sleep(hold);
      if (!alive()) return;
      this.beat = null;
    }
    this.tour = TourState.DONE;
  }
}
