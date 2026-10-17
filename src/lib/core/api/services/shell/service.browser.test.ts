import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Kernel } from "$lib/core/api";
import { boot_test_kernel, stub_service } from "../../kernel/test-kernel";
import * as opfs from "../files/opfs";
import { FilesService } from "../files/service.svelte";
import { NotificationsService } from "../notifications/service.svelte";
import { HISTORY_PATH, ShellService } from "./service.svelte";
import { EntryStatus, type ShellSession, type Value } from "./type";

let shutdown: () => void;
let confirm = true;

async function boot(): Promise<Kernel> {
  const booted = await boot_test_kernel({
    files: FilesService,
    notifications: NotificationsService,
    dialogs: stub_service("dialogs", { show: async () => confirm as never }),
    shell: ShellService,
  });
  shutdown = booted.shutdown;
  return booted.kernel;
}

async function run(session: ShellSession, line: string): Promise<{ status: string; values: Value[]; error: string | null }> {
  const handle = session.run(line);
  await handle.done;
  return { status: handle.entry.status, values: handle.entry.values, error: handle.entry.error };
}

const names = (values: Value[]) => values.map((value) => (value as { name: string }).name);

beforeEach(async () => {
  confirm = true;
  // A save from the previous test may still be writing.
  await vi.waitFor(() => opfs.clear_opfs());
});
afterEach(() => shutdown?.());

describe("ShellService", () => {
  test("collects commands from the services that contribute them", async () => {
    const kernel = await boot();
    const shell = kernel.service<ShellService>("shell");
    for (const id of ["help", "where", "ls", "cp", "notify"]) expect(shell.find(id), id).toBeDefined();
  });

  test("app commands lose an id clash to a service and still register their own", async () => {
    const app_command = (id: string) => ({ id, description: "", app: "jot", run: () => `app ${id}` });
    const booted = await boot_test_kernel({
      files: FilesService,
      notifications: NotificationsService,
      dialogs: stub_service("dialogs", {}),
      apps: stub_service("apps", { shell: () => ({ commands: [app_command("ls"), app_command("jot")] }) }),
      shell: ShellService,
    });
    shutdown = booted.shutdown;
    const shell = booted.kernel.service<ShellService>("shell");
    expect(shell.find("ls")?.app).toBeUndefined();
    expect(shell.find("jot")?.app).toBe("jot");
  });

  test("files: mkdir, touch, ls through where and sort, cd and pwd", async () => {
    const kernel = await boot();
    const session = kernel.service<ShellService>("shell").session();

    expect((await run(session, "mkdir -p ~/Work/old")).status).toBe(EntryStatus.DONE);
    await run(session, "touch ~/Work/b.txt ~/Work/a.md");
    expect(names((await run(session, "ls ~/Work | sort name")).values)).toEqual(["a.md", "b.txt", "old"]);
    expect(names((await run(session, "ls ~/Work | where kind == directory")).values)).toEqual(["old"]);

    await run(session, "cd Work/old");
    expect(session.cwd).toBe("/home/Work/old");
    expect((await run(session, "pwd")).values).toEqual(["/home/Work/old"]);
    expect((await run(session, "cd ../nope")).error).toMatch(/no such folder/);
  });

  test("du sizes a folder, and -d lists what's inside it to sort", async () => {
    const kernel = await boot();
    const files = kernel.service<FilesService>("files");
    const session = kernel.service<ShellService>("shell").session();
    await run(session, "mkdir -p ~/Du/sub");
    await files.create_file(await files.get_directory("/home/Du"), "a.txt", { content: "abc" });
    await files.create_file(await files.get_directory("/home/Du/sub"), "b.txt", { content: "12345" });

    expect((await run(session, "du ~/Du")).values).toMatchObject([{ path: "/home/Du", kind: "directory", size: 8 }]);
    expect((await run(session, "du ~/Du -d 1 | sort size -r")).values).toMatchObject([
      { path: "/home/Du/sub", kind: "directory", size: 5 },
      { path: "/home/Du/a.txt", kind: "file", size: 3 },
    ]);
    expect((await run(session, "du ~/Du -d 2 | where kind == file | sort size")).values).toMatchObject([
      { path: "/home/Du/a.txt" },
      { path: "/home/Du/sub/b.txt" },
    ]);
  });

  test("piped files feed cp and rm", async () => {
    const kernel = await boot();
    const session = kernel.service<ShellService>("shell").session();
    await run(session, "mkdir ~/In ~/Out");
    await run(session, "touch ~/In/a.png ~/In/b.png ~/In/c.txt");

    await run(session, "ls ~/In | where name =~ .png | cp ~/Out");
    expect(names((await run(session, "ls ~/Out")).values).sort()).toEqual(["a.png", "b.png"]);

    await run(session, "ls ~/Out | rm");
    expect((await run(session, "ls ~/Out")).values).toEqual([]);
  });

  test("rename takes piped files, previews with --dry and blocks clashes", async () => {
    const kernel = await boot();
    const session = kernel.service<ShellService>("shell").session();
    await run(session, "mkdir ~/Trip");
    await run(session, "touch ~/Trip/b.jpg ~/Trip/a.jpg ~/Trip/notes.txt");

    const dry = await run(session, 'ls ~/Trip | where name =~ .jpg | sort name | rename "trip-{n:3}{ext}" --dry');
    expect(dry.values).toEqual([
      { $type: "rename", from: "a.jpg", to: "trip-001.jpg", problem: "" },
      { $type: "rename", from: "b.jpg", to: "trip-002.jpg", problem: "" },
    ]);
    expect(names((await run(session, "ls ~/Trip | sort name")).values)).toEqual(["a.jpg", "b.jpg", "notes.txt"]);

    expect((await run(session, 'rename "notes{ext}" ~/Trip/a.jpg ~/Trip/b.jpg')).error).toMatch(/same name/);
    expect((await run(session, 'rename "{size}" ~/Trip/a.jpg')).error).toMatch(/Unknown token/);

    const done = await run(session, "rename '/(\\w)\\.jpg/$1-photo.jpg/' ~/Trip/a.jpg ~/Trip/b.jpg");
    expect(names(done.values)).toEqual(["a-photo.jpg", "b-photo.jpg"]);
    expect(names((await run(session, "ls ~/Trip | sort name")).values)).toEqual(["a-photo.jpg", "b-photo.jpg", "notes.txt"]);
  });

  test("system folders need sudo, and sudo needs a yes", async () => {
    const kernel = await boot();
    const session = kernel.service<ShellService>("shell").session();

    expect((await run(session, "touch /etc/x.txt")).error).toMatch(/read-only/);

    confirm = false;
    expect((await run(session, "sudo touch /etc/x.txt")).error).toMatch(/not confirmed/);

    confirm = true;
    expect((await run(session, "sudo touch /etc/x.txt")).status).toBe(EntryStatus.DONE);
    expect((await run(session, "sudo rm /")).error).toMatch(/refusing/);
  });

  test("history is shared and saved", async () => {
    const kernel = await boot();
    const shell = kernel.service<ShellService>("shell");
    await run(shell.session(), "echo one");
    await run(shell.session(), "echo two");
    await run(shell.session(), "echo two");
    expect(shell.history).toEqual(["echo one", "echo two"]);

    await vi.waitFor(async () => {
      const file = await kernel.service<FilesService>("files").get_file(HISTORY_PATH);
      expect(await file?.text()).toBe("echo one\necho two\n");
    });
  });

  test("Ctrl+C aborts a run", async () => {
    const kernel = await boot();
    const session = kernel.service<ShellService>("shell").session();
    const handle = session.run("ls / | where name == nothing-matches-this | count");
    handle.abort();
    await handle.done;
    expect(handle.entry.status).toBe(EntryStatus.ABORTED);
  });

  test("completion lists real folders", async () => {
    const kernel = await boot();
    const shell = kernel.service<ShellService>("shell");
    const session = shell.session();
    await run(session, "mkdir ~/Pictures");
    const result = await shell.complete("cd ~/Pi", 7, session);
    expect(result.items.map((item) => item.value)).toEqual(["~/Pictures/"]);
  });
});
