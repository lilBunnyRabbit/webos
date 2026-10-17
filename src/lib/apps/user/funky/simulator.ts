import type { Call, Expr } from "./ast";
import { PURE } from "./math";

export type Value = number | string;

export const Evidence = { DOCUMENTED: "documented", ASSUMED: "assumed" } as const;
export type Evidence = (typeof Evidence)[keyof typeof Evidence];

export interface Behaviour {
  title: string;
  evidence: Evidence;
  detail: string;
}

export const BEHAVIOURS: Behaviour[] = [
  { title: "true is 1, false is −1", evidence: Evidence.DOCUMENTED, detail: "Booleans become 1 or −1 next to numbers (1.9.202 notes, funkyguide)." },
  { title: "Anything above 0 counts as true", evidence: Evidence.DOCUMENTED, detail: "For ?:, &, | and !, as for activation groups (funkyguide)." },
  {
    title: "& and | stop early",
    evidence: Evidence.DOCUMENTED,
    detail: "When the left side decides it, the right side isn't evaluated, so rate, sum, smooth or PID there don't update (funkyguide).",
  },
  { title: "?: evaluates one branch", evidence: Evidence.ASSUMED, detail: "The other branch's stateful functions don't update that tick." },
  { title: "Setters run top to bottom, parts after", evidence: Evidence.DOCUMENTED, detail: "A read sees this tick's value of a var set above it, else last tick's (1.11 notes)." },
  { title: "smooth starts at its input", evidence: Evidence.DOCUMENTED, detail: "On load the output equals x, then moves at most `speed` a second." },
  {
    title: "PID derivative is on the measurement",
    evidence: Evidence.ASSUMED,
    detail: "p·e + i·sum(e) − d·rate(current), as the community describes it; the first tick's derivative is 0.",
  },
  { title: "x / 0 is ±infinity, 0 / 0 is NaN", evidence: Evidence.ASSUMED, detail: "C# float division. Guard divisions with max(d, 0.001)." },
  { title: "round(2.5) is 2", evidence: Evidence.ASSUMED, detail: "Half to even, like Unity's Mathf.Round, which the game's function table points at." },
  { title: "sign(0) is 1", evidence: Evidence.ASSUMED, detail: "Unity's Mathf.Sign. The funkyguide doesn't say." },
  { title: "floor(−1.5) is −2, ceil(−1.5) is −1", evidence: Evidence.ASSUMED, detail: "Towards −∞ and +∞, as Mathf does." },
  { title: "ammo() reads the Ammo slider", evidence: Evidence.ASSUMED, detail: "The simulator has no weapons: every ammo() call returns the same number." },
];

const TRUE = 1;
const FALSE = -1;
const truth = (value: boolean) => (value ? TRUE : FALSE);
export const truthy = (value: Value) => typeof value === "number" && value > 0;
const number = (value: Value) => (typeof value === "number" ? value : 0);

export interface Entry {
  name: string;
  expr: Expr;
}

interface RateState {
  previous: number;
}
interface SumState {
  total: number;
}
interface SmoothState {
  value: number;
}
interface PidState {
  integral: number;
  previous: number;
}
type CallState = RateState | SumState | SmoothState | PidState;

export const AMMO = "Ammo";

/** One craft's Funky Trees, ticked like the game: setters in order into one shared store, then the parts. */
export class Simulator {
  private states = new Map<Call, CallState>();
  private store = new Map<string, Value>();
  time = 0;

  constructor(
    private readonly setters: readonly Entry[],
    private readonly outputs: readonly Entry[]
  ) {}

  reset(): void {
    this.states = new Map();
    this.store = new Map();
    this.time = 0;
  }

  step(world: Record<string, Value>, dt: number, watches: readonly Entry[] = []): Record<string, Value> {
    const env: Record<string, Value> = { ...world, Time: this.time };
    const result: Record<string, Value> = {};
    for (const setter of this.setters) {
      const value = this.evaluate(setter.expr, env, dt);
      this.store.set(setter.name, value);
      result[setter.name] = value;
    }
    for (const entry of [...this.outputs, ...watches]) result[entry.name] = this.evaluate(entry.expr, env, dt);
    this.time += dt;
    return result;
  }

  peek(world: Record<string, Value>, dt: number, watches: readonly Entry[] = []): Record<string, Value> {
    const { states, store, time } = this;
    this.states = new Map([...states].map(([call, state]) => [call, { ...state }]));
    this.store = new Map(store);
    try {
      return this.step(world, dt, watches);
    } finally {
      this.states = states;
      this.store = store;
      this.time = time;
    }
  }

  private read(name: string, env: Record<string, Value>): Value {
    return this.store.get(name) ?? env[name] ?? 0;
  }

  private evaluate(expr: Expr, env: Record<string, Value>, dt: number): Value {
    switch (expr.kind) {
      case "number":
      case "string":
        return expr.value;
      case "bool":
        return truth(expr.value);
      case "ident":
      case "prev":
        return this.read(expr.name, env);
      case "unary": {
        const value = this.evaluate(expr.arg, env, dt);
        return expr.op === "-" ? -number(value) : truth(!truthy(value));
      }
      case "ternary":
        return truthy(this.evaluate(expr.cond, env, dt)) ? this.evaluate(expr.then, env, dt) : this.evaluate(expr.otherwise, env, dt);
      case "binary": {
        if (expr.op === "&") return truthy(this.evaluate(expr.left, env, dt)) ? truth(truthy(this.evaluate(expr.right, env, dt))) : FALSE;
        if (expr.op === "|") return truthy(this.evaluate(expr.left, env, dt)) ? TRUE : truth(truthy(this.evaluate(expr.right, env, dt)));
        const left = this.evaluate(expr.left, env, dt);
        const right = this.evaluate(expr.right, env, dt);
        if (expr.op === "==") return truth(left === right);
        if (expr.op === "!=") return truth(left !== right);
        if (expr.op === "+" && (typeof left === "string" || typeof right === "string")) return `${left}${right}`;
        const a = number(left);
        const b = number(right);
        switch (expr.op) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            return a / b;
          case "%":
            return a % b;
          case "<":
            return truth(a < b);
          case ">":
            return truth(a > b);
          case "<=":
            return truth(a <= b);
          default:
            return truth(a >= b);
        }
      }
      case "call":
        return this.call(expr, env, dt);
    }
  }

  private call(expr: Call, env: Record<string, Value>, dt: number): Value {
    const args = expr.args.map((arg) => this.evaluate(arg, env, dt));
    const pure = PURE[expr.callee];
    if (pure) return pure(args.map(number));
    const [x, y, p, i, d] = args.map(number);
    switch (expr.callee) {
      case "ammo":
        return number(env[AMMO] ?? 0);
      case "rate": {
        const state = this.state<RateState>(expr, () => ({ previous: x }));
        const value = dt > 0 ? (x - state.previous) / dt : 0;
        state.previous = x;
        return value;
      }
      case "sum": {
        const state = this.state<SumState>(expr, () => ({ total: 0 }));
        state.total += x * dt;
        return state.total;
      }
      case "smooth": {
        let fresh = false;
        const state = this.state<SmoothState>(expr, () => ((fresh = true), { value: x }));
        if (fresh) return state.value;
        const limit = Math.abs(y) * dt;
        state.value += Math.max(-limit, Math.min(limit, x - state.value));
        return state.value;
      }
      case "PID": {
        const state = this.state<PidState>(expr, () => ({ integral: 0, previous: y }));
        const error = x - y;
        state.integral += error * dt;
        const derivative = dt > 0 ? (y - state.previous) / dt : 0;
        state.previous = y;
        return p * error + i * state.integral - d * derivative;
      }
      default:
        return 0;
    }
  }

  private state<T extends CallState>(expr: Call, create: () => T): T {
    let state = this.states.get(expr) as T | undefined;
    if (!state) {
      state = create();
      this.states.set(expr, state);
    }
    return state;
  }
}
