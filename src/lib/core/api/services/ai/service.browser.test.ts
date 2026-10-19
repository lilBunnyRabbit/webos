import { afterEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel } from "../../kernel/test-kernel";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { TasksService } from "../tasks/service.svelte";
import { MobileAiService } from "./mobile";
import { AiService } from "./service.svelte";
import { AiAvailability, AiFeature, type AiMessage, type AiService as IAiService } from "./type";

let shutdown: () => Promise<void>;

async function boot(ai: typeof AiService | typeof MobileAiService): Promise<Kernel> {
  const booted = await boot_test_kernel({ files: FilesService, notifications: NotificationsService, tasks: TasksService, ai });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const command = (ai: IAiService, id: string) => ai.shell!().commands!.find((entry) => entry.id === id)!;

afterEach(async () => {
  await shutdown?.();
  vi.unstubAllGlobals();
});

interface Created {
  options: { expectedInputs?: { type: string }[]; initialPrompts?: AiMessage[] };
  inputs: unknown[];
}

/** A Prompt API that answers "ok" and records every session it creates and what each was asked. */
function fake_language_model(): Created[] {
  const created: Created[] = [];
  vi.stubGlobal("LanguageModel", {
    availability: async () => "available",
    create: async (options: Created["options"]) => {
      const record: Created = { options, inputs: [] };
      created.push(record);
      return {
        promptStreaming(input: unknown) {
          record.inputs.push(input);
          return new ReadableStream<string>({
            start(controller) {
              controller.enqueue("ok");
              controller.close();
            },
          });
        },
        destroy() {},
      };
    },
  });
  return created;
}

async function answer(ai: IAiService, messages: AiMessage[]): Promise<string> {
  let text = "";
  for await (const chunk of ai.prompt(messages)) text += chunk;
  return text;
}

describe("AiService", () => {
  test("features follow the browser's answers, and the commands show where a feature isn't no", async () => {
    const ai = (await boot(AiService)).service<IAiService>("ai");
    const features = Object.values(AiFeature);
    const answers = await Promise.all(features.map((feature) => ai.availability(feature)));
    expect(features.map((feature) => ai.features[feature])).toEqual(answers);

    const by_command = { summarize: AiFeature.SUMMARIZE, translate: AiFeature.TRANSLATE, lang: AiFeature.DETECT };
    for (const [id, feature] of Object.entries(by_command)) {
      const available = command(ai, id).available?.();
      if (ai.features[feature] === AiAvailability.NO) expect(available).toMatch(/built-in AI/);
      else expect(available).toBe(true);
    }
  });
});

describe("AiService prompt with pictures", () => {
  test("a picture gets a session created for pictures, and its chat reuses that session", async () => {
    const created = fake_language_model();
    const ai = (await boot(AiService)).service<IAiService>("ai");
    expect(await ai.availability(AiFeature.PROMPT_IMAGE)).toBe(AiAvailability.READY);

    await answer(ai, [{ role: "user", content: "Hi" }]);
    expect(created[0].options.expectedInputs).toBeUndefined();
    expect(created[0].inputs).toEqual(["Hi"]);

    const photo = new Blob(["png"], { type: "image/png" });
    const question: AiMessage = { role: "user", content: [{ type: "text", value: "What's on it?" }, { type: "image", value: photo }] };
    await answer(ai, [question]);
    expect(created).toHaveLength(2);
    expect(created[1].options.expectedInputs).toContainEqual({ type: "image" });
    expect(created[1].inputs).toEqual([[question]]);

    await answer(ai, [question, { role: "assistant", content: "ok" }, { role: "user", content: "And?" }]);
    expect(created).toHaveLength(2);
    expect(created[1].inputs.at(-1)).toBe("And?");

    const same_looking = new Blob(["png"], { type: "image/png" });
    const other: AiMessage = { role: "user", content: [{ type: "text", value: "What's on it?" }, { type: "image", value: same_looking }] };
    await answer(ai, [other, { role: "assistant", content: "ok" }, { role: "user", content: "And?" }]);
    expect(created).toHaveLength(3);
    expect(created[2].options.initialPrompts).toEqual([other, { role: "assistant", content: "ok" }]);
    expect(ai.sessions.map((session) => session.feature)).toEqual([
      AiFeature.PROMPT,
      AiFeature.PROMPT_IMAGE,
      AiFeature.PROMPT_IMAGE,
    ]);
  });

  test("a text chat that gains a picture moves to a session for pictures", async () => {
    const created = fake_language_model();
    const ai = (await boot(AiService)).service<IAiService>("ai");
    const first: AiMessage = { role: "user", content: "Hi" };
    await answer(ai, [first]);
    const photo: AiMessage = { role: "user", content: [{ type: "image", value: new Blob(["x"]) }] };
    await answer(ai, [first, { role: "assistant", content: "ok" }, photo]);
    expect(created).toHaveLength(2);
    expect(created[1].options.expectedInputs).toContainEqual({ type: "image" });
  });
});

describe("MobileAiService", () => {
  test("answers no, hides its commands and refuses work with what's needed", async () => {
    const ai = (await boot(MobileAiService)).service<IAiService>("ai");
    for (const feature of Object.values(AiFeature)) expect(await ai.availability(feature)).toBe(AiAvailability.NO);
    expect(ai.features).toEqual({ summarize: "no", translate: "no", detect: "no", prompt: "no", "prompt-image": "no" });

    for (const id of ["summarize", "translate", "lang"]) expect(command(ai, id).available?.()).toMatch(/built-in AI/);

    await expect(ai.summarize("Some text")).rejects.toThrow(/desktop Chrome/);
    await expect(ai.translate("Hallo", { to: "en", from: "de" })).rejects.toThrow(/desktop Chrome/);
    await expect(ai.prompt([{ role: "user", content: "Hi" }]).next()).rejects.toThrow(/desktop Chrome/);
    expect(ai.sessions).toEqual([]);
    expect(ai.downloads).toEqual([]);
  });
});
