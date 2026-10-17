import { afterEach, describe, expect, test } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel } from "../../kernel/test-kernel";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { TasksService } from "../tasks/service.svelte";
import { MobileAiService } from "./mobile";
import { AiService } from "./service.svelte";
import { AiAvailability, AiFeature, type AiService as IAiService } from "./type";

let shutdown: () => void;

async function boot(ai: typeof AiService | typeof MobileAiService): Promise<Kernel> {
  const booted = await boot_test_kernel({ files: FilesService, notifications: NotificationsService, tasks: TasksService, ai });
  shutdown = booted.shutdown;
  return booted.kernel;
}

const command = (ai: IAiService, id: string) => ai.shell!().commands!.find((entry) => entry.id === id)!;

afterEach(() => shutdown?.());

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

describe("MobileAiService", () => {
  test("answers no, hides its commands and refuses work with what's needed", async () => {
    const ai = (await boot(MobileAiService)).service<IAiService>("ai");
    for (const feature of Object.values(AiFeature)) expect(await ai.availability(feature)).toBe(AiAvailability.NO);
    expect(ai.features).toEqual({ summarize: "no", translate: "no", detect: "no", prompt: "no" });

    for (const id of ["summarize", "translate", "lang"]) expect(command(ai, id).available?.()).toMatch(/built-in AI/);

    await expect(ai.summarize("Some text")).rejects.toThrow(/desktop Chrome/);
    await expect(ai.translate("Hallo", { to: "en", from: "de" })).rejects.toThrow(/desktop Chrome/);
    await expect(ai.prompt([{ role: "user", content: "Hi" }]).next()).rejects.toThrow(/desktop Chrome/);
    expect(ai.sessions).toEqual([]);
    expect(ai.downloads).toEqual([]);
  });
});
