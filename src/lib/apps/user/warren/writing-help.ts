import type { AiMessage } from "$lib/core/api";

export const HelpMode = {
  SHORTER: "shorter",
  CLEARER: "clearer",
  FRIENDLIER: "friendlier",
  FORMAL: "formal",
  SUMMARY: "summary",
} as const;
export type HelpMode = (typeof HelpMode)[keyof typeof HelpMode];

export const HELP_MODES: { mode: HelpMode; label: string; ask: string }[] = [
  { mode: HelpMode.SHORTER, label: "Shorter", ask: "Rewrite it shorter, about half as long, keeping what matters." },
  { mode: HelpMode.CLEARER, label: "Clearer", ask: "Rewrite it so it's clearer and easier to read." },
  { mode: HelpMode.FRIENDLIER, label: "Friendlier", ask: "Rewrite it in a friendlier, warmer tone." },
  { mode: HelpMode.FORMAL, label: "More formal", ask: "Rewrite it in a more formal, professional tone." },
  { mode: HelpMode.SUMMARY, label: "Summarise", ask: "Summarise it in two or three sentences." },
];

/** Past this a selection is refused rather than cut: Nano's context is small and a cut would lose the end silently. */
export const HELP_MAX_CHARACTERS = 6000;

const SYSTEM =
  "You are a writing assistant inside a word processor. Do exactly what is asked with the user's text. Keep its language, names, numbers and facts; " +
  "invent nothing. Reply with the new text only: no introduction, no quotes around it, no Markdown. Separate paragraphs with a blank line.";

export function help_messages(mode: HelpMode, text: string): AiMessage[] {
  const ask = HELP_MODES.find((item) => item.mode === mode)!.ask;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${ask}\n\nText:\n${text}` },
  ];
}

/** Models sometimes wrap the answer in quotes or a lead-in line anyway. */
export function clean_help(text: string): string {
  let clean = text.trim().replace(/^(here(?:'s| is)[^\n]*:\s*\n)/i, "");
  if (/^["“].*["”]$/s.test(clean) && !/["“”]/.test(clean.slice(1, -1))) clean = clean.slice(1, -1);
  return clean.trim();
}
