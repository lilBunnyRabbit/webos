import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushSync } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import type { SettingsService } from "../settings/type";
import type { WindowsService } from "../windows/type";
import { SpeechService } from "./service.svelte";
import type { SpeechService as ISpeechService } from "./type";

let shutdown: () => Promise<void>;
let spoken: SpeechSynthesisUtterance[];
const open = new SvelteSet<string>();

// Headless Chromium has no audio: the browser's queue is watched, and each utterance is finished by hand.
beforeEach(() => {
  spoken = [];
  open.clear();
  vi.spyOn(speechSynthesis, "speak").mockImplementation((utterance) => void spoken.push(utterance));
  vi.spyOn(speechSynthesis, "cancel").mockImplementation(() => {});
});

afterEach(async () => {
  await shutdown?.();
  vi.restoreAllMocks();
});

async function boot(): Promise<ISpeechService> {
  const booted = await boot_test_kernel({
    settings: stub_service<SettingsService>("settings", { speech: { voice: null, rate: 1.5 } }),
    windows: stub_service<WindowsService>("windows", { exists: (id: string) => open.has(id) }),
    files: stub_service("files", {}),
    speech: SpeechService,
  });
  shutdown = booted.shutdown;
  return booted.kernel.service<ISpeechService>("speech");
}

const finish = () => spoken.at(-1)!.dispatchEvent(new Event("end"));
const texts = () => spoken.map((utterance) => utterance.text);

describe("SpeechService", () => {
  test("feed speaks finished sentences one at a time, end flushes the tail", async () => {
    const speech = await boot();
    speech.feed("a", "Hello there. How ar");
    expect(speech.speaking).toBe("a");
    expect(texts()).toEqual(["Hello there."]);
    expect(spoken[0].rate).toBe(1.5);

    speech.feed("a", "e you? Fine");
    expect(texts()).toEqual(["Hello there."]);
    expect(speech.queued).toBe(1);
    finish();
    expect(texts()).toEqual(["Hello there.", "How are you?"]);

    speech.end("a");
    finish();
    expect(texts()).toEqual(["Hello there.", "How are you?", "Fine"]);
    finish();
    expect(speech.speaking).toBeNull();
  });

  test("the newest owner preempts; stopping another owner does nothing", async () => {
    const speech = await boot();
    speech.feed("a", "One. Two. ");
    speech.speak("b", "Three. Four.");
    expect(speech.speaking).toBe("b");
    expect(texts()).toEqual(["One.", "Three."]);

    speech.stop("a");
    expect(speech.speaking).toBe("b");
    finish();
    expect(texts().at(-1)).toBe("Four.");

    speech.stop("b");
    expect(speech.speaking).toBeNull();
    expect(speech.queued).toBe(0);
  });

  test("a stale utterance finishing after a stop doesn't restart the queue", async () => {
    const speech = await boot();
    speech.speak("a", "One. Two.");
    const first = spoken[0];
    speech.stop();
    first.dispatchEvent(new Event("end"));
    expect(texts()).toEqual(["One."]);
  });

  test("markdown is read without symbols, code blocks as Code block.", async () => {
    const speech = await boot();
    speech.speak("a", "## Tip\n**Run** it:\n```sh\nls -la\n```\nDone.", { markdown: true });
    for (let index = 0; index < 4; index++) finish();
    expect(texts()).toEqual(["Tip", "Run it:", "Code block.", "Done."]);
  });

  test("a window's speech stops when the window closes", async () => {
    open.add("win-1");
    const speech = await boot();
    speech.feed("win-1", "Still talking. More");
    speech.feed("shell", "x");
    speech.feed("win-1", "Again. ");
    expect(speech.speaking).toBe("win-1");
    open.delete("win-1");
    flushSync();
    expect(speech.speaking).toBeNull();
  });
});
