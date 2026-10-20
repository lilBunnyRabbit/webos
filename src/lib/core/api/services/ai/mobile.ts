import type { TaskJob } from "../tasks/type";
import { ai_shell } from "./shell";
import { AI_REQUIREMENTS, AiAvailability, type AiFeature, type AiService as IAiService, type AiSessionInfo, type AiUsage } from "./type";

const unavailable = () => new Error(AI_REQUIREMENTS);

/** Phones and tablets: Chrome on Android has no built-in AI, so every feature answers "no" (ADR-046). */
export class MobileAiService implements IAiService {
  name = "MobileAiService";
  description = "On-device AI, which phones don't have: every feature answers no";
  inspector = () => import("./inspector.svelte");
  shell = () => ai_shell(this, () => null);

  to_string(): string {
    return "MobileAiService: unavailable";
  }

  readonly features: Record<AiFeature, AiAvailability> = {
    summarize: AiAvailability.NO,
    translate: AiAvailability.NO,
    detect: AiAvailability.NO,
    prompt: AiAvailability.NO,
    "prompt-image": AiAvailability.NO,
  };
  readonly downloads: TaskJob[] = [];
  readonly sessions: AiSessionInfo[] = [];

  async availability(): Promise<AiAvailability> {
    return AiAvailability.NO;
  }

  async summarize(): Promise<string> {
    throw unavailable();
  }

  async translate(): Promise<string> {
    throw unavailable();
  }

  async detect(): Promise<never> {
    throw unavailable();
  }

  async *prompt(): AsyncGenerator<string, AiUsage> {
    throw unavailable();
  }

  async extract(): Promise<never> {
    throw unavailable();
  }

  async measure(): Promise<AiUsage> {
    throw unavailable();
  }
}
