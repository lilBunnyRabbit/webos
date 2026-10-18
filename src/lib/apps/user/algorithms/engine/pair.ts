import { z } from "zod";
import { InputError, InputKind, random_int, type InputSpec } from "./inputs";

export interface Pair {
  a: string;
  b: string;
}

export function pair_spec(options: { sample: Pair; hint: string; names: [string, string]; max: [number, number]; alphabet: string }): InputSpec<Pair> {
  const check = (value: Pair) => {
    if (!value.a || !value.b) throw new InputError(`Give both, like ${options.hint}.`);
    if (value.a.length > options.max[0]) throw new InputError(`The ${options.names[0]} can be up to ${options.max[0]} characters.`);
    if (value.b.length > options.max[1]) throw new InputError(`The ${options.names[1]} can be up to ${options.max[1]} characters.`);
    return value;
  };
  return {
    kind: InputKind.TEXT,
    hint: `${options.names[0]} | ${options.names[1]}, like ${options.hint}`,
    schema: z.object({ a: z.string().min(1).max(options.max[0]), b: z.string().min(1).max(options.max[1]) }),
    parse: (value) => {
      const at = value.indexOf("|");
      if (at === -1) throw new InputError(`Separate the ${options.names[0]} and the ${options.names[1]} with |, like ${options.hint}.`);
      return check({ a: value.slice(0, at).trim(), b: value.slice(at + 1).trim() });
    },
    format: (value) => `${value.a} | ${value.b}`,
    random: () => {
      const make = (length: number) => Array.from({ length }, () => options.alphabet[random_int(0, options.alphabet.length - 1)]).join("");
      const b = make(Math.min(options.max[1], 24));
      const at = random_int(0, b.length - 4);
      return { a: b.slice(at, at + Math.min(options.max[0], random_int(2, 4))), b };
    },
    sample: options.sample,
  };
}

