import { flushSync, mount, unmount } from "svelte";
import { afterEach, expect, test, vi } from "vitest";
import Host from "./fixtures/speed-reader-host.svelte";

const WORDS_KEY = "app.speed-reader.words";
const TEXT = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");

let host: ReturnType<typeof mount> | null = null;

afterEach(() => {
  if (host) unmount(host);
  host = null;
  flushSync();
  localStorage.removeItem(WORDS_KEY);
});

test("closing mid-play keeps the words read so far", async () => {
  localStorage.setItem(WORDS_KEY, "7");
  const achievements = { achieve: vi.fn(), progress: vi.fn() };
  const target = document.createElement("div");
  document.body.append(target);
  host = mount(Host, { target, props: { achievements } });
  flushSync();

  const textarea = target.querySelector<HTMLTextAreaElement>("textarea[aria-label='Text to read']")!;
  textarea.value = TEXT;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
  [...target.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Read")!.click();
  const play = await vi.waitFor(() => {
    const button = target.querySelector<HTMLButtonElement>("button[aria-label='Play (Space)']");
    if (!button) throw new Error("no play button");
    return button;
  });
  play.click();
  flushSync();
  await new Promise((resolve) => setTimeout(resolve, 800));

  unmount(host);
  host = null;
  flushSync();

  const stored = Number(localStorage.getItem(WORDS_KEY));
  expect(stored).toBeGreaterThan(7);
  expect(achievements.progress).toHaveBeenCalledWith("words-10000", stored);
  expect(achievements.achieve).not.toHaveBeenCalledWith("the-end");
});
