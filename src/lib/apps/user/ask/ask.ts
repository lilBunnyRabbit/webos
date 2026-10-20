// Gemini Nano's context is a few thousand tokens, shared by the file, the chat and the answer; ~4 characters a token.
export const MAX_FILE_CHARS = 16_000;

export interface AskSource {
  name: string;
  text: string;
  clipped: boolean;
}

export function clip_source(name: string, text: string, max = MAX_FILE_CHARS): AskSource {
  return text.length > max ? { name, text: text.slice(0, max), clipped: true } : { name, text, clipped: false };
}

export function system_prompt(source: AskSource | null): string {
  if (!source) return "You are a helpful assistant. Answer briefly and plainly.";
  return [
    `You answer questions about the file "${source.name}", shown between the markers below.`,
    "Use only what the file says; when it doesn't answer the question, say so. Answer briefly and plainly.",
    source.clipped ? "Only the start of the file is shown." : "",
    "--- file start ---",
    source.text,
    "--- file end ---",
  ]
    .filter(Boolean)
    .join("\n");
}

export const MODEL_SETTINGS = "chrome://settings/system";

export function safe_href(href: string): string | null {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}
