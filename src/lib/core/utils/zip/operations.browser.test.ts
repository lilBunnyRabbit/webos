import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { compress_into, extract_to } from "./operations";

let files: FilesService;
let notifications: NotificationsService;

beforeAll(() => {
  files = new FilesService();
  notifications = new NotificationsService();
  kernel.services.set("files", files);
  kernel.services.set("notifications", notifications);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
});

async function seed(path: string, text: string): Promise<void> {
  const segments = path.split("/").filter(Boolean);
  let directory = await files.get_root();
  for (const segment of segments.slice(0, -1)) directory = await directory.getDirectoryHandle(segment, { create: true });
  await files.create_file(directory, segments.at(-1)!, { content: text, overwrite: true });
}

describe("archive operations", () => {
  test("compresses into the folder under a free name and extracts next to it", async () => {
    await seed("/home/Docs/a.txt", "alpha");
    await seed("/home/Docs.zip", "taken");

    const zip = await compress_into(["/home/Docs"], "/home");
    expect(zip).toBe("/home/Docs (1).zip");

    const result = await extract_to(zip!, "/home/Docs");
    expect(result?.path).toBe("/home/Docs/Docs (1)");
    expect(await (await files.get_file("/home/Docs/Docs (1)/Docs/a.txt"))?.text()).toBe("alpha");
  });

  test("a cancelled extraction offers to discard the folder it created", async () => {
    await seed("/home/In/a.txt", "alpha");
    const zip = (await compress_into(["/home/In"], "/home"))!;

    const controller = new AbortController();
    const result = await extract_to(zip, "/home", { signal: controller.signal, on_job: (job) => job && controller.abort() });
    expect(result).toBeNull();
    expect(await files.get_directory("/home/In (1)")).not.toBeNull();

    const warning = notifications.all.find((notification) => notification.title === "Extraction cancelled");
    expect(warning?.actions?.map((action) => action.label)).toEqual(["Discard", "Keep"]);
    warning!.actions![0].on_click();
    await vi.waitFor(async () => expect(await files.get_directory("/home/In (1)")).toBeNull());
    expect(await files.get_file(zip)).not.toBeNull();
  });
});
