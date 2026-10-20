import type { FilesService, Kernel, TasksService } from "$lib/core/api";
import { TaskJobStatus, type TaskJob } from "../tasks/type";
import { check, has_image, history_key, IMAGE_INPUTS, same_language } from "./availability";
import { z } from "zod";
import { ai_shell } from "./shell";
import {
  AI_REQUIREMENTS,
  AiAvailability,
  AiFeature,
  type AiMessage,
  type AiService as IAiService,
  type AiSessionInfo,
  type AiUsage,
  type DetectedLanguage,
  type LanguagePair,
  type SummarizeOptions,
  type TranslateOptions,
} from "./type";

const work = () => import("./download");

export const AI_TASK_OWNER = "ai";
const CHAT_CAP = 4;

interface Kept<T extends BuiltInModel = BuiltInModel> extends AiSessionInfo {
  key: string;
  model: Promise<T>;
}

export class AiService implements IAiService {
  name = "AiService";
  description = "Chrome's on-device AI: summaries, translation, language detection and chat";
  inspector = () => import("./inspector.svelte");
  shell = () => ai_shell(this, () => this.files_service);

  to_string(): string {
    const ready = Object.values(this.features).filter((state) => state === AiAvailability.READY).length;
    return `AiService: ${ready} ready, ${this.kept.length} sessions`;
  }

  public features = $state<Record<AiFeature, AiAvailability>>({
    summarize: AiAvailability.NO,
    translate: AiAvailability.NO,
    detect: AiAvailability.NO,
    prompt: AiAvailability.NO,
    "prompt-image": AiAvailability.NO,
  });

  private kept = $state.raw<Kept[]>([]);

  public get sessions(): AiSessionInfo[] {
    return this.kept.map(({ feature, label, usage }) => ({ feature, label, usage }));
  }

  public get downloads(): TaskJob[] {
    return this.tasks_service.jobs.filter(
      (job) => job.app_id === AI_TASK_OWNER && job.status === TaskJobStatus.RUNNING
    );
  }

  private tasks_service!: TasksService;
  private files_service!: FilesService;

  constructor(private kernel: Kernel) {
    this.tasks_service = $derived(this.kernel.service<TasksService>("tasks"));
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
  }

  init(): void {
    // Not awaited: the browser's checks shouldn't hold up boot. Until they answer, every feature reads "no".
    void Promise.all(Object.values(AiFeature).map((feature) => this.availability(feature)));
  }

  destroy(): void {
    for (const kept of this.kept) void kept.model.then((model) => model.destroy()).catch(() => {});
    this.kept = [];
  }

  async availability(feature: AiFeature, pair?: LanguagePair): Promise<AiAvailability> {
    const answer = await check(feature, pair);
    if (feature !== AiFeature.TRANSLATE || !pair) this.features[feature] = answer;
    else if (answer === AiAvailability.READY) this.features.translate = answer;
    return answer;
  }

  async summarize(text: string, { type = "key-points", length = "short", signal }: SummarizeOptions = {}): Promise<string> {
    const summarizer = await this.reuse(`summarize ${type} ${length}`, AiFeature.SUMMARIZE, `Summarizer (${type}, ${length})`, {
      check: () => this.availability(AiFeature.SUMMARIZE),
      create: (options) => globalThis.Summarizer!.create({ type, length, format: "plain-text", ...options }),
    });
    return summarizer.summarize(text, { signal });
  }

  async translate(text: string, { to, from, signal }: TranslateOptions): Promise<string> {
    const source = from ?? (await this.detect(text, { signal }))[0]?.language;
    if (!source || source === "und") throw new Error("Couldn't tell which language the text is in. Say it with --from");
    if (same_language(source, to)) return text;
    const pair = { from: source, to };
    const translator = await this.reuse(`translate ${source} ${to}`, AiFeature.TRANSLATE, `Translator (${source} → ${to})`, {
      check: () => this.availability(AiFeature.TRANSLATE, pair),
      create: (options) => globalThis.Translator!.create({ sourceLanguage: source, targetLanguage: to, ...options }),
    });
    return translator.translate(text, { signal });
  }

  async detect(text: string, { signal }: { signal?: AbortSignal } = {}): Promise<DetectedLanguage[]> {
    const detector = await this.reuse("detect", AiFeature.DETECT, "Language detector", {
      check: () => this.availability(AiFeature.DETECT),
      create: (options) => globalThis.LanguageDetector!.create(options),
    });
    const results = await detector.detect(text, { signal });
    return results.map((result) => ({ language: result.detectedLanguage, confidence: result.confidence }));
  }

  async *prompt(messages: AiMessage[], { signal }: { signal?: AbortSignal } = {}): AsyncGenerator<string, AiUsage> {
    const last = messages.at(-1);
    if (last?.role !== "user") throw new Error("The last message has to be the user's");
    const history = messages.slice(0, -1);

    // A session only takes pictures when it was created for them, so the kind is part of the key.
    const image = has_image(messages);
    const feature = image ? AiFeature.PROMPT_IMAGE : AiFeature.PROMPT;
    const prefix = image ? "prompt image" : "prompt";

    // A session holds its conversation, so a kept one is taken out while it answers: two windows never share one.
    const key = `${prefix} ${history_key(history)}`;
    const kept = this.kept.find((entry) => entry.key === key) as Kept<BuiltInLanguageModel> | undefined;
    if (kept) this.kept = this.kept.filter((entry) => entry !== kept);
    const session = await (kept?.model ??
      this.create(feature, image ? "Language model with pictures" : "Language model", {
        check: () => this.availability(feature),
        create: (options) =>
          globalThis.LanguageModel!.create({
            initialPrompts: history,
            ...(image ? { expectedInputs: IMAGE_INPUTS } : {}),
            ...options,
          }),
      }));

    let answer = "";
    let complete = false;
    try {
      const input = typeof last.content === "string" ? last.content : [{ role: last.role, content: last.content }];
      for await (const chunk of session.promptStreaming(input, { signal })) {
        answer += chunk;
        yield chunk;
      }
      complete = true;
    } finally {
      // Stopped, failed or abandoned half-way: the session holds a partial turn, so it can't match a later history.
      if (!complete) session.destroy();
    }

    const usage = { used: session.contextUsage, window: session.contextWindow };
    const turns = messages.filter((message) => message.role === "user").length;
    const chats = this.kept.filter((entry) => entry.feature === AiFeature.PROMPT || entry.feature === AiFeature.PROMPT_IMAGE);
    const evicted = chats.length >= CHAT_CAP ? chats[0] : null;
    if (evicted) void evicted.model.then((model) => model.destroy());
    this.kept = [
      ...this.kept.filter((entry) => entry !== evicted),
      {
        key: `${prefix} ${history_key([...messages, { role: "assistant", content: answer }])}`,
        feature,
        label: `Chat, ${turns} ${turns === 1 ? "question" : "questions"}`,
        model: Promise.resolve(session),
        usage,
      },
    ];
    return usage;
  }

  async extract<T>(messages: AiMessage[], schema: z.ZodType<T>, { signal }: { signal?: AbortSignal } = {}): Promise<T> {
    const last = messages.at(-1);
    if (last?.role !== "user" || typeof last.content !== "string") throw new Error("The last message has to be the user's, as text");
    const session = await this.create(AiFeature.PROMPT, "Language model", {
      check: () => this.availability(AiFeature.PROMPT),
      create: (options) => globalThis.LanguageModel!.create({ initialPrompts: messages.slice(0, -1), ...options }),
    });
    try {
      const answer = await session.prompt(last.content, { signal, responseConstraint: z.toJSONSchema(schema) });
      return schema.parse(JSON.parse(answer));
    } finally {
      session.destroy();
    }
  }

  async measure(text: string, { signal }: { signal?: AbortSignal } = {}): Promise<AiUsage> {
    const counter = await this.reuse("measure", AiFeature.PROMPT, "Token counter", {
      check: () => this.availability(AiFeature.PROMPT),
      create: (options) => globalThis.LanguageModel!.create(options),
    });
    return { used: await counter.measureContextUsage(text, { signal }), window: counter.contextWindow };
  }

  private reuse<T extends BuiltInModel>(
    key: string,
    feature: AiFeature,
    label: string,
    factory: { check: () => Promise<AiAvailability>; create: (options: BuiltInCreateOptions) => Promise<T> }
  ): Promise<T> {
    const found = this.kept.find((entry) => entry.key === key);
    if (found) return found.model as Promise<T>;
    const model = this.create(feature, label, factory);
    const entry: Kept<T> = { key, feature, label, model };
    this.kept = [...this.kept, entry];
    model.catch(() => (this.kept = this.kept.filter((other) => other !== entry)));
    return model;
  }

  private async create<T>(
    feature: AiFeature,
    label: string,
    { check, create }: { check: () => Promise<AiAvailability>; create: (options: BuiltInCreateOptions) => Promise<T> }
  ): Promise<T> {
    const state = await check();
    if (state === AiAvailability.NO) throw new Error(`${label} isn't available here. ${AI_REQUIREMENTS}`);
    if (state === AiAvailability.READY) return create({});

    const { download_task } = await work();
    const job = this.tasks_service.run<T>(AI_TASK_OWNER, (context) => download_task(`Download ${label}`, create, context), {
      title: `Downloading the ${label.toLowerCase()}`,
      done: () => ({ title: `${label} downloaded`, message: "It runs on this device from now on, offline too" }),
    });
    const model = await job.done;
    if (model === null) throw new Error(job.status === TaskJobStatus.CANCELLED ? "Download cancelled" : (job.error ?? "Download failed"));
    this.features[feature] = AiAvailability.READY;
    return model;
  }
}
