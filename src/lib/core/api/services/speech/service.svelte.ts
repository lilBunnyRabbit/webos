import type { Kernel } from "../../kernel/kernel.svelte";
import type { FilesService } from "../files/type";
import type { SettingsService } from "../settings/type";
import type { WindowsService } from "../windows/type";
import { speech_shell } from "./shell";
import { speakable, split_sentences } from "./text";
import type { SpeakOptions, SpeechOwner, SpeechService as ISpeechService } from "./type";

interface Stream {
  owner: SpeechOwner;
  markdown: boolean;
  buffer: string;
  ended: boolean;
  is_window: boolean;
}

export class SpeechService implements ISpeechService {
  name = "SpeechService";
  description = "Reads text aloud with the browser's voices, one speaker at a time";
  inspector = () => import("./inspector.svelte");
  shell = () => speech_shell(this, () => this.kernel.service<FilesService>("files"));

  to_string(): string {
    return `SpeechService: ${this.voices.length} voices, ${this.speaking ? `${this.speaking} speaking` : "quiet"}`;
  }

  public voices = $state.raw<SpeechSynthesisVoice[]>([]);
  public readonly supported = "speechSynthesis" in globalThis;

  private stream = $state.raw<Stream | null>(null);
  private pending = $state.raw<string[]>([]);
  // The browser drops an utterance's events when nothing holds it, and a cancelled one still fires `end` or `error`.
  private current: SpeechSynthesisUtterance | null = null;
  private generation = 0;

  private settings_service!: SettingsService;
  private windows_service!: WindowsService;
  private dispose_effects?: () => void;
  private load_voices = () => (this.voices = speechSynthesis.getVoices());

  constructor(private kernel: Kernel) {
    this.settings_service = $derived(this.kernel.service<SettingsService>("settings"));
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
  }

  public get speaking(): SpeechOwner | null {
    return this.stream?.owner ?? null;
  }

  public get queued(): number {
    return this.pending.length;
  }

  init(): void {
    if (!this.supported) return;
    this.load_voices();
    speechSynthesis.addEventListener("voiceschanged", this.load_voices);
    this.dispose_effects = $effect.root(() => {
      $effect(() => {
        const stream = this.stream;
        if (stream?.is_window && !this.windows_service.exists(stream.owner)) this.stop(stream.owner);
      });
    });
  }

  destroy(): void {
    this.dispose_effects?.();
    if (!this.supported) return;
    speechSynthesis.removeEventListener("voiceschanged", this.load_voices);
    this.stop();
  }

  speak(owner: SpeechOwner, text: string, options: SpeakOptions = {}): void {
    this.silence();
    this.feed(owner, text, options);
    this.end(owner);
  }

  feed(owner: SpeechOwner, chunk: string, { markdown = false }: SpeakOptions = {}): void {
    if (!this.supported) return;
    let stream = this.stream;
    if (stream?.owner !== owner || stream.ended) {
      this.silence();
      stream = { owner, markdown, buffer: "", ended: false, is_window: this.windows_service.exists(owner) };
    }
    const { sentences, rest } = split_sentences(stream.buffer + chunk, stream.markdown);
    this.stream = { ...stream, buffer: rest };
    this.enqueue(sentences);
  }

  end(owner: SpeechOwner): void {
    const stream = this.stream;
    if (stream?.owner !== owner || stream.ended) return;
    this.stream = { ...stream, buffer: "", ended: true };
    this.enqueue([stream.buffer]);
  }

  stop(owner?: SpeechOwner): void {
    if (owner !== undefined && this.stream?.owner !== owner) return;
    this.silence();
  }

  private silence(): void {
    this.generation++;
    this.stream = null;
    this.pending = [];
    this.current = null;
    if (this.supported) speechSynthesis.cancel();
  }

  private enqueue(raw: string[]): void {
    const markdown = this.stream?.markdown ?? false;
    const lines = raw.map((sentence) => speakable(sentence, markdown)).filter(Boolean);
    if (lines.length > 0) this.pending = [...this.pending, ...lines];
    if (!this.current) this.next();
  }

  // One utterance at a time, not the whole queue handed to the browser: Chrome cuts long queues short, and only the
  // service's own queue can say what's left.
  private next(): void {
    const [line, ...rest] = this.pending;
    if (line === undefined) {
      this.current = null;
      if (this.stream?.ended) this.stream = null;
      return;
    }
    this.pending = rest;
    const generation = this.generation;
    const utterance = new SpeechSynthesisUtterance(line);
    const { voice, rate } = this.settings_service.speech;
    const chosen = voice ? this.voices.find((option) => option.voiceURI === voice) : undefined;
    if (chosen) utterance.voice = chosen;
    else utterance.lang = document.documentElement.lang || navigator.language;
    utterance.rate = rate;
    const done = () => {
      if (generation !== this.generation || this.current !== utterance) return;
      this.current = null;
      this.next();
    };
    utterance.addEventListener("end", done);
    utterance.addEventListener("error", done);
    this.current = utterance;
    speechSynthesis.speak(utterance);
  }
}
