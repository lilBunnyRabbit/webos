export interface TextPart {
  text: string;
  keep: boolean;
}

/** "nearly seven years of experience" from the approved short bio, so the years are never typed into the app. */
export function experience_line(about: string): string | null {
  const match = about.match(/\b(?:(?:nearly|almost|over|about|more than)\s+)?[\w-]+\s+years?\s+of\s+experience\b/i);
  if (!match) return null;
  return match[0].charAt(0).toUpperCase() + match[0].slice(1);
}

/** Words with a hyphen stay whole: a line break inside "Full-Stack" reads as a typo. */
export function keep_hyphenated(text: string): TextPart[] {
  return text
    .split(/(\S+-\S+)/)
    .filter(Boolean)
    .map((part) => ({ text: part, keep: /\S-\S/.test(part) }));
}

/**
 * The opening clause of a highlight, whole: up to the first comma, semicolon or colon that leaves at least `min`
 * characters, without trailing punctuation. A sentence with no such break stays whole.
 */
export function first_clause(text: string, min = 24): string {
  const pattern = /[,;:]\s/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index >= min) return text.slice(0, match.index);
  }
  return text.replace(/\.$/, "");
}

export function lead_clause(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const cut = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
  if (cut > max * 0.4) return `${head.slice(0, cut)}…`;
  const space = head.lastIndexOf(" ");
  return `${head.slice(0, space > 0 ? space : max).replace(/[,;:]$/, "")}…`;
}
