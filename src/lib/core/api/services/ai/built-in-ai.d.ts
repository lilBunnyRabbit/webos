// Chrome's built-in AI (Writing Assistance, Translator and Prompt API specs), which TypeScript's DOM lib doesn't declare.

type BuiltInAvailability = "unavailable" | "downloadable" | "downloading" | "available";

interface BuiltInDownloadProgressEvent extends Event {
  /** A fraction, 0-1, not bytes. */
  readonly loaded: number;
  readonly total: number;
}

interface BuiltInCreateMonitor extends EventTarget {
  addEventListener(type: "downloadprogress", listener: (event: BuiltInDownloadProgressEvent) => void): void;
}

interface BuiltInCreateOptions {
  signal?: AbortSignal;
  monitor?: (monitor: BuiltInCreateMonitor) => void;
}

interface BuiltInModel {
  destroy(): void;
}

type SummarizerType = "tldr" | "key-points" | "teaser" | "headline";
type SummarizerLength = "short" | "medium" | "long";

interface SummarizerCreateCoreOptions {
  type?: SummarizerType;
  format?: "plain-text" | "markdown";
  length?: SummarizerLength;
  expectedInputLanguages?: string[];
  outputLanguage?: string;
}

interface BuiltInSummarizer extends BuiltInModel {
  summarize(input: string, options?: { context?: string; signal?: AbortSignal }): Promise<string>;
  summarizeStreaming(input: string, options?: { context?: string; signal?: AbortSignal }): ReadableStream<string>;
  readonly inputQuota: number;
}

interface SummarizerConstructor {
  availability(options?: SummarizerCreateCoreOptions): Promise<BuiltInAvailability>;
  create(options?: SummarizerCreateCoreOptions & BuiltInCreateOptions & { sharedContext?: string }): Promise<BuiltInSummarizer>;
}

interface TranslatorCreateCoreOptions {
  sourceLanguage: string;
  targetLanguage: string;
}

interface BuiltInTranslator extends BuiltInModel {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  translateStreaming(input: string, options?: { signal?: AbortSignal }): ReadableStream<string>;
}

interface TranslatorConstructor {
  availability(options: TranslatorCreateCoreOptions): Promise<BuiltInAvailability>;
  create(options: TranslatorCreateCoreOptions & BuiltInCreateOptions): Promise<BuiltInTranslator>;
}

interface LanguageDetectionResult {
  /** BCP 47, or `"und"` when it can't tell. */
  detectedLanguage: string;
  confidence: number;
}

interface BuiltInLanguageDetector extends BuiltInModel {
  detect(input: string, options?: { signal?: AbortSignal }): Promise<LanguageDetectionResult[]>;
}

interface LanguageDetectorConstructor {
  availability(options?: { expectedInputLanguages?: string[] }): Promise<BuiltInAvailability>;
  create(options?: { expectedInputLanguages?: string[] } & BuiltInCreateOptions): Promise<BuiltInLanguageDetector>;
}

type LanguageModelMessageContent = { type: "text"; value: string } | { type: "image"; value: Blob };

interface LanguageModelMessage {
  role: "system" | "user" | "assistant";
  content: string | LanguageModelMessageContent[];
}

interface LanguageModelCreateCoreOptions {
  /** A session that will see pictures has to ask for `image` when it's created. */
  expectedInputs?: { type: "text" | "image"; languages?: string[] }[];
  expectedOutputs?: { type: "text"; languages?: string[] }[];
}

interface BuiltInLanguageModel extends BuiltInModel {
  prompt(input: string | LanguageModelMessage[], options?: { signal?: AbortSignal }): Promise<string>;
  /** Chunks are pieces of the answer, not the answer so far. */
  promptStreaming(input: string | LanguageModelMessage[], options?: { signal?: AbortSignal }): ReadableStream<string>;
  readonly contextUsage: number;
  readonly contextWindow: number;
}

interface LanguageModelConstructor {
  availability(options?: LanguageModelCreateCoreOptions): Promise<BuiltInAvailability>;
  create(
    options?: LanguageModelCreateCoreOptions & BuiltInCreateOptions & { initialPrompts?: LanguageModelMessage[] }
  ): Promise<BuiltInLanguageModel>;
}

declare var Summarizer: SummarizerConstructor | undefined;
declare var Translator: TranslatorConstructor | undefined;
declare var LanguageDetector: LanguageDetectorConstructor | undefined;
declare var LanguageModel: LanguageModelConstructor | undefined;
