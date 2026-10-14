import { error_message } from "$lib/core/utils";
export interface RegexGroup {
  name: string;
  value: string | undefined;
}

export interface RegexMatch {
  index: number;
  end: number;
  value: string;
  groups: RegexGroup[];
}

export interface RegexSegment {
  text: string;
  match: number | null;
}

export type RegexResult = { ok: true; matches: RegexMatch[]; truncated: boolean } | { ok: false; error: string };

export const MAX_MATCHES = 1000;

function to_match(found: RegExpExecArray): RegexMatch {
  const groups: RegexGroup[] = found.slice(1).map((value, i) => ({ name: String(i + 1), value }));
  for (const [name, value] of Object.entries(found.groups ?? {})) groups.push({ name, value });
  return { index: found.index, end: found.index + found[0].length, value: found[0], groups };
}

export function find_matches(pattern: string, flags: string, text: string): RegexResult {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (reason) {
    return { ok: false, error: error_message(reason) };
  }

  if (!regex.global) {
    const found = regex.exec(text);
    return { ok: true, matches: found ? [to_match(found)] : [], truncated: false };
  }

  const unicode = regex.unicode || regex.flags.includes("v");
  const matches: RegexMatch[] = [];
  let found: RegExpExecArray | null;
  while ((found = regex.exec(text))) {
    matches.push(to_match(found));
    if (matches.length >= MAX_MATCHES) return { ok: true, matches, truncated: true };
    // An empty match leaves lastIndex in place; step past it (a whole code point in unicode mode) or this never ends.
    if (found[0] === "") {
      const code = text.codePointAt(regex.lastIndex);
      regex.lastIndex += unicode && code !== undefined && code > 0xffff ? 2 : 1;
    }
  }
  return { ok: true, matches, truncated: false };
}

export function segment_text(text: string, matches: RegexMatch[]): RegexSegment[] {
  const segments: RegexSegment[] = [];
  let cursor = 0;
  matches.forEach((match, i) => {
    if (match.end === match.index) return;
    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), match: null });
    segments.push({ text: text.slice(match.index, match.end), match: i });
    cursor = match.end;
  });
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: null });
  return segments;
}
