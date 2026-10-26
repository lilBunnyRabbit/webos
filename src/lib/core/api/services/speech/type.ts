import type { IService } from "../../type";

/** Who is speaking: a window id for apps, `SHELL_SPEAKER` for `say`. */
export type SpeechOwner = string;

export const SHELL_SPEAKER: SpeechOwner = "shell";

export interface SpeakOptions {
  /** Read the text as markdown: symbols dropped, links as their text, a fenced code block as "Code block.". */
  markdown?: boolean;
}

/**
 * The page's one speech queue (`speechSynthesis`, ADR-074). One owner speaks at a time and the newest wins: speech from
 * another owner cancels what's playing first. Voice and rate come from Settings (`settings.speech`). An owner that is a
 * window id is stopped when that window closes.
 */
export interface SpeechService extends IService {
  /** The browser's voices; empty until it lists them (`voiceschanged`), and always where speech isn't supported. */
  readonly voices: SpeechSynthesisVoice[];
  /** The owner speaking, or about to (fed, waiting for its first sentence); `null` when quiet. */
  readonly speaking: SpeechOwner | null;
  /** Sentences waiting behind the one being spoken. */
  readonly queued: number;
  /** False where the browser has no `speechSynthesis`; every call is then a no-op. */
  readonly supported: boolean;

  /** Speaks the whole text, sentence by sentence, replacing whatever was being said (the owner's own speech too). */
  speak(owner: SpeechOwner, text: string, options?: SpeakOptions): void;
  /** Streaming: buffers `chunk` and queues each sentence as it completes. The first chunk from a new owner preempts. */
  feed(owner: SpeechOwner, chunk: string, options?: SpeakOptions): void;
  /** Ends the owner's stream: the unfinished tail is spoken too. */
  end(owner: SpeechOwner): void;
  /** Silences `owner`, only while it is the one speaking; no owner silences everything. */
  stop(owner?: SpeechOwner): void;
}
