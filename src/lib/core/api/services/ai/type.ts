import type { z } from "zod";
import type { IService } from "../../type";
import type { TaskJob } from "../tasks/type";

export const AiFeature = {
  SUMMARIZE: "summarize",
  TRANSLATE: "translate",
  DETECT: "detect",
  PROMPT: "prompt",
  PROMPT_IMAGE: "prompt-image",
} as const;
export type AiFeature = (typeof AiFeature)[keyof typeof AiFeature];

export const AiAvailability = {
  READY: "ready",
  /** Works after a one-time model download, which needs a click or a key press to start. */
  DOWNLOAD: "download",
  NO: "no",
} as const;
export type AiAvailability = (typeof AiAvailability)[keyof typeof AiAvailability];

export const SUMMARY_TYPES = ["tldr", "key-points", "teaser", "headline"] as const;
export type SummaryType = (typeof SUMMARY_TYPES)[number];
export const SUMMARY_LENGTHS = ["short", "medium", "long"] as const;
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

export const AI_REQUIREMENTS =
  "On-device AI needs desktop Chrome with its built-in AI (Gemini Nano): Chrome 138 or newer for summaries, translation and language detection, 148 for chat, and about 22 GB of free disk space for the one-time model download. Phones and other browsers don't have it.";

export interface LanguagePair {
  /** BCP 47, like `en` or `sl`. */
  from: string;
  to: string;
}

export interface SummarizeOptions {
  type?: SummaryType;
  length?: SummaryLength;
  signal?: AbortSignal;
}

export interface TranslateOptions {
  to: string;
  from?: string;
  signal?: AbortSignal;
}

export interface DetectedLanguage {
  /** BCP 47, or `"und"` when the model can't tell. */
  language: string;
  confidence: number;
}

export interface AiTextPart {
  type: "text";
  value: string;
}

export interface AiImagePart {
  type: "image";
  value: Blob;
}

export type AiPart = AiTextPart | AiImagePart;

export interface AiMessage {
  role: "system" | "user" | "assistant";
  /** Text, or parts mixing text and pictures (needs `prompt-image`). */
  content: string | AiPart[];
}

/** Tokens: how much a session or a text takes of the model's context window. */
export interface AiUsage {
  used: number;
  window: number;
}

export interface AiSessionInfo {
  feature: AiFeature;
  label: string;
  /** Chats only, after their latest answer. */
  usage?: AiUsage;
}

/**
 * Chrome's built-in AI, run on the device (ADR-046). Models download once, as tasks; sessions are kept and reused. The
 * mobile variant answers `"no"` for everything, so callers hide AI features instead of failing.
 */
export interface AiService extends IService {
  /**
   * The last known answer per feature, checked at boot. `translate` is the API as a whole (`"download"` until a pair
   * turns out ready); ask `availability` for a pair.
   */
  readonly features: Record<AiFeature, AiAvailability>;
  readonly downloads: TaskJob[];
  readonly sessions: AiSessionInfo[];

  /** Asks the browser again and updates `features`. `pair` is required for an exact answer on translate. */
  availability(feature: AiFeature, pair?: LanguagePair): Promise<AiAvailability>;
  summarize(text: string, options?: SummarizeOptions): Promise<string>;
  /** Detects `from` when it's missing; text already in `to` comes back unchanged. */
  translate(text: string, options: TranslateOptions): Promise<string>;
  /** Most likely first. */
  detect(text: string, options?: { signal?: AbortSignal }): Promise<DetectedLanguage[]>;
  /**
   * Streams the answer to the last message, a `user` one, in pieces. A leading `system` message sets the instructions.
   * A conversation that continues where an earlier call ended reuses that call's session. A picture in any message
   * needs `prompt-image` and gets a session created to accept pictures.
   */
  prompt(messages: AiMessage[], options?: { signal?: AbortSignal }): AsyncGenerator<string, AiUsage>;
  /**
   * Answers the last message, a `user` one, with a value matching `schema` (sent as the answer's JSON Schema), parsed
   * and validated. A fresh session each call: nothing is kept.
   */
  extract<T>(messages: AiMessage[], schema: z.ZodType<T>, options?: { signal?: AbortSignal }): Promise<T>;
  /** How many tokens `text` takes, and the context window it's measured against. */
  measure(text: string, options?: { signal?: AbortSignal }): Promise<AiUsage>;
}
