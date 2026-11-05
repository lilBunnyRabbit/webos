import { flushSync, mount, unmount } from "svelte";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import Host from "./fixtures/speed-reader-host.svelte";

const TEXT = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");

let files: FilesService;
let host: ReturnType<typeof mount> | null = null;

async function app_directory() {
  const lib = await files.get_directory("/var/lib");
  return files.create_directory(await files.create_directory(lib, "apps"), "speed-reader");
}

async function stored_words(): Promise<number> {
  const file = await files.get_file("/var/lib/apps/speed-reader/storage.json");
  return file ? (JSON.parse(await file.text()) as { words: number }).words : 0;
}

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

afterEach(async () => {
  if (host) unmount(host);
  host = null;
  flushSync();
  const apps = await files.get_directory("/var/lib/apps");
  if (apps) await files.delete_entry(apps, "speed-reader", { recursive: true });
});

test("closing mid-play keeps the words read so far", async () => {
  await files.create_file(await app_directory(), "storage.json", { content: JSON.stringify({ words: 7 }), overwrite: true });
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

  await vi.waitFor(async () => expect(await stored_words()).toBeGreaterThan(7));
  expect(achievements.progress).toHaveBeenCalledWith("words-10000", await stored_words());
  expect(achievements.achieve).not.toHaveBeenCalledWith("the-end");
});
