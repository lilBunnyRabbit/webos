import type { InputSpec } from "./inputs";
import type { Step } from "./step";

export type ParamValue = number | string;
export type Params = Record<string, ParamValue>;

export type Param =
  | { id: string; label: string; kind: "number"; min: number; max: number; step?: number; default: number }
  | { id: string; label: string; kind: "choice"; choices: { value: string; label: string }[]; default: string };

export interface Operation {
  id: string;
  label: string;
  placeholder: string | null;
}

export interface Operations<I> {
  list: Operation[];
  apply(input: I, operation: string, value: string): I;
}

export interface Preset<I> {
  label: string;
  value: I;
}

export interface Definition<I = unknown, R = unknown> {
  intro: string;
  use: string;
  traits?: string[];
  pseudocode: string[];
  input: InputSpec<I>;
  presets?: Preset<I>[];
  params?: Param[];
  operations?: Operations<I>;
  credit?: { text: string; url: string };
  run(input: I, params: Params): Generator<Step, R>;
}

export const define = <I, R>(definition: Definition<I, R>): Definition<I, R> => definition;

export function default_params(params: Param[] | undefined): Params {
  return Object.fromEntries((params ?? []).map((param) => [param.id, param.default]));
}

export function clean_params(params: Param[] | undefined, given: Record<string, unknown> | undefined): Params {
  const result = default_params(params);
  for (const param of params ?? []) {
    const value = given?.[param.id];
    if (param.kind === "number" && typeof value === "number" && value >= param.min && value <= param.max) result[param.id] = value;
    if (param.kind === "choice" && typeof value === "string" && param.choices.some((choice) => choice.value === value)) result[param.id] = value;
  }
  return result;
}

export const MAX_STEPS = 20_000;

export interface Recording<R> {
  steps: Step[];
  result: R | undefined;
  truncated: boolean;
}

export function record<I, R>(definition: Definition<I, R>, input: I, params: Params, limit = MAX_STEPS): Recording<R> {
  const steps: Step[] = [];
  const generator = definition.run(input, params);
  for (;;) {
    const next = generator.next();
    if (next.done) return { steps, result: next.value, truncated: false };
    if (steps.length >= limit) return { steps, result: undefined, truncated: true };
    steps.push(next.value);
  }
}
