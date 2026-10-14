export interface Token {
  value: string;
  start: number;
  end: number;
  /** An unquoted `|`. */
  pipe?: true;
  /** Inside quotes, even partly: never a flag. */
  quoted?: true;
}

/**
 * Splits on whitespace and unquoted `|`. Single and double quotes group, a backslash escapes the next character.
 * An unclosed quote runs to the end, so a line being typed still tokenises.
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let current: Token | null = null;
  let quote: string | null = null;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quote) {
      if (char === quote) quote = null;
      else if (char === "\\" && quote === '"' && index + 1 < input.length) current!.value += input[++index];
      else current!.value += char;
      current!.end = index + 1;
      continue;
    }

    if (/\s/.test(char)) {
      current = null;
      continue;
    }

    if (char === "|") {
      current = null;
      tokens.push({ value: "|", start: index, end: index + 1, pipe: true });
      continue;
    }

    if (!current) {
      current = { value: "", start: index, end: index };
      tokens.push(current);
    }

    if (char === '"' || char === "'") {
      quote = char;
      current.quoted = true;
    } else if (char === "\\" && index + 1 < input.length) {
      current.value += input[++index];
    } else {
      current.value += char;
    }
    current.end = index + 1;
  }

  return tokens;
}

/** Tokens between pipes. `a | | b` keeps the empty stage, so the parser can report it. */
export function split_stages(tokens: Token[]): Token[][] {
  const stages: Token[][] = [[]];
  for (const token of tokens) {
    if (token.pipe) stages.push([]);
    else stages.at(-1)!.push(token);
  }
  return stages;
}

/** Escapes a value so it tokenises back to itself. Backslashes, not quotes, so a completed folder can be typed on. */
export function escape(value: string): string {
  return value === "" ? '""' : value.replace(/([\s"'\\|])/g, "\\$1");
}
