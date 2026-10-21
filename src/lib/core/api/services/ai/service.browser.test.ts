import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
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
  constraints: unknown[];
  destroyed: boolean;
}

/** A Prompt API that answers "ok" and records every session it creates and what each was asked. */
function fake_language_model(): Created[] {
  const created: Created[] = [];
  vi.stubGlobal("LanguageModel", {
    availability: async () => "available",
    create: async (options: Created["options"]) => {
      const record: Created = { options, inputs: [], constraints: [], destroyed: false };
      created.push(record);
      return {
        contextUsage: 120,
        contextWindow: 6144,
        async prompt(input: unknown, prompt_options: { responseConstraint?: unknown }) {
          record.inputs.push(input);
          record.constraints.push(prompt_options.responseConstraint);
          return JSON.stringify({ command: "cal agenda", args: ["tomorrow"] });
        },
        async measureContextUsage(input: string) {
          return input.length;
        },
        promptStreaming(input: unknown) {
          record.inputs.push(input);
          return new ReadableStream<string>({
            start(controller) {
              controller.enqueue("ok");
              controller.close();
            },
          });
        },
        destroy() {
          record.destroyed = true;
        },
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
    const picture: AiMessage = { role: "user", content: [{ type: "image", value: new Blob(["x"]) }] };
    await expect(ai.extract([picture], z.object({ word: z.string() }))).rejects.toThrow(/desktop Chrome/);
    expect(ai.sessions).toEqual([]);
    expect(ai.downloads).toEqual([]);
  });
});

describe("AiService structured answers and usage", () => {
  test("extract sends the schema, validates the answer and drops its session", async () => {
    const created = fake_language_model();
    const ai = (await boot(AiService)).service<IAiService>("ai");
    const schema = z.object({ command: z.enum(["cal agenda", "none"]), args: z.array(z.string()) });
    const messages: AiMessage[] = [
      { role: "system", content: "Pick" },
      { role: "user", content: "what am I doing tomorrow" },
    ];
    expect(await ai.extract(messages, schema)).toEqual({ command: "cal agenda", args: ["tomorrow"] });
    expect(created[0].options.initialPrompts).toEqual([{ role: "system", content: "Pick" }]);
    expect(created[0].constraints[0]).toMatchObject({ type: "object", required: ["command", "args"] });
    expect(created[0].destroyed).toBe(true);
    expect(ai.sessions).toEqual([]);

    await expect(ai.extract(messages, z.object({ command: z.literal("none") }))).rejects.toThrow();
  });

  test("extract with a picture gets a session for pictures with the schema, never kept", async () => {
    const created = fake_language_model();
    const ai = (await boot(AiService)).service<IAiService>("ai");
    await answer(ai, [{ role: "user", content: "Hi" }]);
    const schema = z.object({ command: z.string(), args: z.array(z.string()) });
    const doodle = new Blob(["png"], { type: "image/png" });
    const question: AiMessage = { role: "user", content: [{ type: "text", value: "Guess" }, { type: "image", value: doodle }] };

    expect(await ai.extract([{ role: "system", content: "Guess the drawing" }, question], schema)).toEqual({
      command: "cal agenda",
      args: ["tomorrow"],
    });
    expect(created).toHaveLength(2);
    expect(created[1].options.expectedInputs).toContainEqual({ type: "image" });
    expect(created[1].options.initialPrompts).toEqual([{ role: "system", content: "Guess the drawing" }]);
    expect(created[1].inputs).toEqual([[question]]);
    expect(created[1].constraints[0]).toMatchObject({ type: "object", required: ["command", "args"] });
    expect(created[1].destroyed).toBe(true);
    expect(ai.sessions.map((session) => session.feature)).toEqual([AiFeature.PROMPT]);
  });

  test("extract refuses a conversation that doesn't end with the user, and a picture where pictures aren't available", async () => {
    vi.stubGlobal("LanguageModel", {
      availability: async (options?: { expectedInputs?: { type: string }[] }) =>
        options?.expectedInputs?.some((input) => input.type === "image") ? "unavailable" : "available",
      create: async () => {
        throw new Error("never created");
      },
    });
    const ai = (await boot(AiService)).service<IAiService>("ai");
    const schema = z.object({ word: z.string() });
    await expect(ai.extract([{ role: "assistant", content: "Hi" }], schema)).rejects.toThrow(/user's/);
    const picture: AiMessage = { role: "user", content: [{ type: "image", value: new Blob(["x"]) }] };
    await expect(ai.extract([picture], schema)).rejects.toThrow(/with pictures isn't available here/);
    expect(ai.features[AiFeature.PROMPT_IMAGE]).toBe(AiAvailability.NO);
  });

  test("a chat reports its usage when it ends, and measure counts against the window", async () => {
    fake_language_model();
    const ai = (await boot(AiService)).service<IAiService>("ai");
    const stream = ai.prompt([{ role: "user", content: "Hi" }]);
    let step = await stream.next();
    while (!step.done) step = await stream.next();
    expect(step.value).toEqual({ used: 120, window: 6144 });
    expect(ai.sessions[0].usage).toEqual({ used: 120, window: 6144 });

    expect(await ai.measure("12345")).toEqual({ used: 5, window: 6144 });
  });
});
