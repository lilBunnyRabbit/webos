import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import kernel, { type IService } from "$lib/core/api";
import { stub_service } from "$lib/core/api/kernel/test-kernel";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import { JobKind } from "$lib/core/api/services/scheduler";
import { SchedulerService } from "$lib/core/api/services/scheduler/service.svelte";
import manifest from "./index";
import { clear_opfs, get_root } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { DecryptError, PBKDF2_ITERATIONS, random_bytes, RECOVERY_BYTES, unlock_with_phrase } from "./crypto";
import { delete_quick, device_key, read_quick } from "./device";
import { add_activity } from "./activities";
import { add_to_inbox, inbox_path } from "./inbox";
import { APP_ID, ENTRIES_DIR, HEADER_FILE, INDEX_FILE, JOURNAL_ROOT, media_token, REMINDER_JOB } from "./journal";
import { MAX_ATTEMPTS, pin_secret, QuickGate, QuickMethod, taps_secret } from "./quick";
import { JournalSession, LockedError } from "./session.svelte";
import { lock_all } from "./sessions";
import { child, list_journals, read_bin, remove_bin, write_bin, write_header } from "./store";
import {
  change_phrase,
  create_journal,
  delete_journal,
  rename_journal,
  quick_state,
  QuickClosedError,
  regenerate_recovery,
  setup_quick,
  unlock_phrase,
  unlock_quick,
  unlock_recovery,
  WrongQuickError,
  type Unlocked,
} from "./unlock";

const FAST = 1_000;
const PHRASE = "acorn bubble cactus dagger eclipse";
const MARKER = "MOONRABBIT-PLAINTEXT-MARKER-7f3a";
const SLOW = 120_000;

let files: FilesService;
const sessions: JournalSession[] = [];

beforeEach(async () => {
  await clear_opfs();
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("webos.moonrabbit");
    req.onsuccess = req.onerror = req.onblocked = resolve;
  });
  files = new FilesService();
  await files.init();
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.lock();
});

async function journal(name = "Journal", iterations = FAST) {
  const recovery = random_bytes(RECOVERY_BYTES);
  const created = await create_journal(files, name, PHRASE, recovery, iterations);
  return { ...created, recovery };
}

function open_session({ ref, key }: Unlocked, on_lock = () => {}): JournalSession {
  const session = new JournalSession(() => files, ref, key, on_lock);
  sessions.push(session);
  return session;
}

async function photo(): Promise<string> {
  const canvas = new OffscreenCanvas(8, 8);
  canvas.getContext("2d")!.fillRect(0, 0, 4, 4);
  const blob = await canvas.convertToBlob({ type: "image/webp" });
  return `data:image/webp;base64,${btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))}`;
}

async function every_file(directory: FileSystemDirectoryHandle, path = ""): Promise<{ path: string; bytes: Uint8Array }[]> {
  const out: { path: string; bytes: Uint8Array }[] = [];
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind === "directory") out.push(...(await every_file(handle as FileSystemDirectoryHandle, `${path}/${name}`)));
    else out.push({ path: `${path}/${name}`, bytes: new Uint8Array(await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer()) });
  }
  return out;
}

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

describe("journal on disk", () => {
  test("creates /home/Journal lazily with the ADR-063 layout", async () => {
    expect(await files.get_directory(JOURNAL_ROOT)).toBeNull();
    const { ref } = await journal("Dreams");
    expect(ref.path).toBe("/home/Journal/Dreams");
    for (const name of [ENTRIES_DIR, "media", "inbox"]) expect(await files.get_directory(child(ref.path, name))).not.toBeNull();
    expect(await files.get_file(child(ref.path, INDEX_FILE))).not.toBeNull();
    const header = JSON.parse(await (await files.get_file(child(ref.path, HEADER_FILE)))!.text());
    expect(Object.keys(header).sort()).toEqual(["id", "inbox_private_wrapped", "inbox_public_key", "kdf", "version", "wraps"]);
    expect((await list_journals(files)).map((item) => item.name)).toEqual(["Dreams"]);
  });

  test("a taken name gets a free one", async () => {
    await journal("Journal");
    const { ref } = await journal("Journal");
    expect(ref.name).toBe("Journal (1)");
  });

  test(
    "nothing written to OPFS or localStorage holds the plaintext",
    async () => {
      const created = await journal();
      const session = open_session(created);
      const first = await session.save(session.new_entry("2026-10-22", `# ${MARKER}\nToday #${MARKER.toLowerCase()}`));
      const media = await session.add_media(await photo());
      await session.save({ ...first, body: `${first.body}\n${media_token(media)}\nmore ${MARKER}` });
      await session.save(session.new_entry("2026-10-21", `${MARKER} again`, "evening"));
      await session.save({ ...session.new_entry("2026-10-20", ""), mood: 2, activities: ["walk"], energy: 3, sleep: 6.5 });
      await session.set_activities(add_activity(session.activities, MARKER, "star"));
      const [listed] = await list_journals(files);
      await add_to_inbox(files, { ...listed, header: listed.header! }, { date: "2026-10-22", created: Date.now(), body: `${MARKER} merged`, mood: 5 });
      expect(await session.merge_inbox()).toBe(1);
      await add_to_inbox(files, { ...listed, header: listed.header! }, { date: "2026-10-22", created: Date.now(), body: `${MARKER} still waiting` });
      await regenerate_recovery(files, created.ref, { phrase: PHRASE });
      await change_phrase(files, created.ref, { phrase: PHRASE }, `${PHRASE} moon`);

      const needles = [MARKER, MARKER.toLowerCase(), PHRASE, "acorn"].map((text) => new TextEncoder().encode(text));
      const written = await every_file(await get_root());
      expect(written.some((file) => file.path.endsWith(".bin"))).toBe(true);
      expect(written.filter((file) => file.path.includes("/inbox/"))).toHaveLength(1);
      for (const file of written) for (const needle of needles) expect(contains(file.bytes, needle), file.path).toBe(false);
      for (let i = 0; i < localStorage.length; i++) {
        const value = localStorage.getItem(localStorage.key(i)!) ?? "";
        expect(value.includes(MARKER) || value.includes("acorn")).toBe(false);
      }
    },
    SLOW
  );
});

describe("session", () => {
  test("saves, lists newest first, reads back and removes with photos", async () => {
    const session = open_session(await journal());
    const old = await session.save(session.new_entry("2026-10-01", "old one"));
    const media = await session.add_media(await photo());
    const today = await session.save(session.new_entry("2026-10-22", `today #walk ${media_token(media)}`));
    await session.load_index();
    expect(session.index.map((meta) => meta.title)).toEqual(["today #walk", "old one"]);
    expect(session.index[0].tags).toEqual(["walk"]);
    expect(session.index[0].media).toEqual([media]);
    expect((await session.media_bytes(media)).length).toBeGreaterThan(10);
    expect(await session.media_url(media)).toMatch(/^blob:/);

    await session.save({ ...today, body: "today, no photo" });
    expect(await files.get_file(child(session.ref.path, `media/${media}.bin`))).toBeNull();
    await session.remove(old.id);
    expect(await files.get_file(child(session.ref.path, `${ENTRIES_DIR}/${old.id}.bin`))).toBeNull();
    expect(session.index.map((meta) => meta.id)).toEqual([today.id]);
  });

  test("two windows saving at once both land in the index", async () => {
    const created = await journal();
    const a = open_session(created);
    const b = open_session({ ref: created.ref, key: created.key });
    await Promise.all([a.save(a.new_entry("2026-10-22", "from a")), b.save(b.new_entry("2026-10-22", "from b")), a.save(a.new_entry("2026-10-21", "a again"))]);
    await b.load_index();
    expect(b.index.map((meta) => meta.title).sort()).toEqual(["a again", "from a", "from b"]);
  });

  test("an entry file moved onto another entry's name fails to open", async () => {
    const session = open_session(await journal());
    const one = await session.save(session.new_entry("2026-10-22", "one"));
    const two = await session.save(session.new_entry("2026-10-22", "two"));
    const folder = child(session.ref.path, ENTRIES_DIR);
    await write_bin(files, folder, `${two.id}.bin`, (await read_bin(files, child(folder, `${one.id}.bin`)))!);
    const fresh = open_session(await unlock_phrase(files, session.ref, PHRASE));
    await expect(fresh.entry(two.id)).rejects.toBeInstanceOf(DecryptError);
    await expect(fresh.entry(one.id)).resolves.toMatchObject({ body: "one" });
  });

  test("lock drops the key: journal lock locks every session", async () => {
    let locked = 0;
    const created = await journal();
    const a = open_session(created, () => locked++);
    const b = open_session(created, () => locked++);
    const entry = await a.save(a.new_entry("2026-10-22", "secret"));
    expect(lock_all()).toBe(2);
    expect(locked).toBe(2);
    expect(a.locked && b.locked).toBe(true);
    expect(a.index).toEqual([]);
    await expect(a.entry(entry.id)).rejects.toBeInstanceOf(LockedError);
    expect(lock_all()).toBe(0);
  });

  test("an edit still waiting to save when the journal locks is saved, then the key is gone", async () => {
    const created = await journal();
    const session = open_session(created);
    const draft = session.new_entry("2026-10-22", "typed just before the lock");
    let pending: Promise<unknown> | null = null;
    session.before_lock(() => (pending = session.save(draft)));
    session.lock();
    await pending;
    await expect(session.entry(draft.id)).rejects.toBeInstanceOf(LockedError);
    const reopened = open_session(await unlock_phrase(files, created.ref, PHRASE));
    await reopened.load_index();
    expect(reopened.index.map((meta) => meta.title)).toEqual(["typed just before the lock"]);
  });
});

describe("unlocking", () => {
  test("phrase, wrong phrase, recovery code, and the data key stays non-extractable", async () => {
    const { ref, recovery } = await journal();
    const unlocked = await unlock_phrase(files, ref, PHRASE);
    expect(unlocked.key.extractable).toBe(false);
    await expect(unlock_phrase(files, ref, "wrong phrase")).rejects.toBeInstanceOf(DecryptError);
    await expect(unlock_recovery(files, ref, recovery)).resolves.toBeDefined();
    await expect(unlock_recovery(files, ref, random_bytes(RECOVERY_BYTES))).rejects.toBeInstanceOf(DecryptError);
  });

  test(
    "a stored count below today's is raised on the next unlock; 600,000 iterations measured",
    async () => {
      const { ref } = await journal("Old", FAST);
      const started = performance.now();
      const unlocked = await unlock_phrase(files, ref, PHRASE);
      const upgrade_ms = performance.now() - started;
      expect(unlocked.ref.header.kdf.iterations).toBe(PBKDF2_ITERATIONS);
      const timed = performance.now();
      await unlock_with_phrase(unlocked.ref.header, PHRASE);
      console.info(`[moonrabbit] PBKDF2 ${PBKDF2_ITERATIONS}: unlock ${Math.round(performance.now() - timed)} ms, upgrade ${Math.round(upgrade_ms)} ms`);
      const [listed] = await list_journals(files);
      expect(listed.header?.kdf.iterations).toBe(PBKDF2_ITERATIONS);
    },
    SLOW
  );

  test(
    "changing the phrase keeps every entry readable",
    async () => {
      const created = await journal();
      const session = open_session(created);
      const entry = await session.save(session.new_entry("2026-10-22", "kept"));
      const ref = await change_phrase(files, created.ref, { recovery: created.recovery }, "new moon phrase words here");
      await expect(unlock_phrase(files, ref, PHRASE)).rejects.toBeInstanceOf(DecryptError);
      const next = open_session(await unlock_phrase(files, ref, "new moon phrase words here"));
      await expect(next.entry(entry.id)).resolves.toMatchObject({ body: "kept" });
    },
    SLOW
  );

  test("the device key is a non-extractable HMAC key kept in IndexedDB", async () => {
    const key = await device_key();
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe("HMAC");
    expect(await device_key()).toBeInstanceOf(CryptoKey);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });
});

describe("quick unlock", () => {
  test(
    "a PIN opens; five wrong tries delete the wrap",
    async () => {
      const { ref } = await journal();
      await setup_quick(files, ref, PHRASE, { method: QuickMethod.PIN, secret: pin_secret("246810") });
      expect((await quick_state(files, ref))?.gate).toBe(QuickGate.OPEN);
      const unlocked = await unlock_quick(files, ref, pin_secret("246810"));
      expect(unlocked.key.extractable).toBe(false);

      for (let i = 1; i <= MAX_ATTEMPTS; i++) {
        const error = await unlock_quick(files, ref, pin_secret("111111")).catch((reason) => reason);
        expect(error).toBeInstanceOf(WrongQuickError);
        expect((error as WrongQuickError).left).toBe(MAX_ATTEMPTS - i);
      }
      const header = (await list_journals(files))[0].header!;
      expect(await read_quick(header.id)).toBeUndefined();
      await expect(unlock_quick(files, ref, pin_secret("246810"))).rejects.toBeInstanceOf(QuickClosedError);
    },
    SLOW
  );

  test(
    "a right PIN resets the wrong-try count",
    async () => {
      const { ref } = await journal();
      await setup_quick(files, ref, PHRASE, { method: QuickMethod.PIN, secret: pin_secret("135790") });
      await expect(unlock_quick(files, ref, pin_secret("000000"))).rejects.toBeInstanceOf(WrongQuickError);
      await unlock_quick(files, ref, pin_secret("135790"));
      expect((await quick_state(files, ref))?.record.attempts).toBe(0);
    },
    SLOW
  );

  test(
    "a rewritten journal.json (a restore) needs the master phrase once, then quick unlock works again",
    async () => {
      const { ref } = await journal();
      const hops = ["carrot", "moon", "moon", "egg", "sun", "clover"];
      await setup_quick(files, ref, PHRASE, { method: QuickMethod.TAPS, secret: taps_secret(hops), shuffle: true });
      const header = (await list_journals(files))[0].header!;
      await new Promise((resolve) => setTimeout(resolve, 5));
      await write_header(files, ref.path, header);
      expect((await quick_state(files, ref))?.gate).toBe(QuickGate.RESTORED);
      const error = await unlock_quick(files, ref, taps_secret(hops)).catch((reason) => reason);
      expect(error).toBeInstanceOf(QuickClosedError);
      expect((error as QuickClosedError).gate).toBe(QuickGate.RESTORED);

      await unlock_phrase(files, ref, PHRASE);
      expect((await quick_state(files, ref))?.gate).toBe(QuickGate.OPEN);
      await expect(unlock_quick(files, ref, taps_secret(hops))).resolves.toBeDefined();
      await delete_quick(header.id);
      expect(await quick_state(files, ref)).toBeNull();
    },
    SLOW
  );

  test(
    "the app's own header writes keep quick unlock open",
    async () => {
      const { ref } = await journal();
      await setup_quick(files, ref, PHRASE, { method: QuickMethod.PIN, secret: pin_secret("123123") });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await regenerate_recovery(files, ref, { phrase: PHRASE });
      expect((await quick_state(files, ref))?.gate).toBe(QuickGate.OPEN);
    },
    SLOW
  );
});

describe("adding while locked", () => {
  async function locked_ref(name = "Journal") {
    const created = await journal(name);
    const listed = (await list_journals(files)).find((item) => item.name === created.ref.name)!;
    return { created, ref: { ...listed, header: listed.header! } };
  }

  async function inbox_names(path: string): Promise<string[]> {
    const folder = await files.get_directory(path);
    return folder ? (await files.list(folder)).map((item) => item.name) : [];
  }

  test("writes with the header alone; the next unlock merges it into entries and empties the inbox", async () => {
    const { created, ref } = await locked_ref();
    const id = await add_to_inbox(files, ref, { date: "2026-10-22", created: 1_000, body: "on the bus", mood: 4 });
    expect(await inbox_names(inbox_path(ref))).toEqual([`${id}.bin`]);

    const session = open_session(await unlock_phrase(files, created.ref, PHRASE));
    expect(await session.merge_inbox()).toBe(1);
    expect(session.arrived).toBe(1);
    expect(session.index).toMatchObject([{ id, date: "2026-10-22", mood: 4, title: "on the bus" }]);
    await expect(session.entry(id)).resolves.toMatchObject({ body: "on the bus", mood: 4, created: 1_000 });
    expect(await inbox_names(inbox_path(ref))).toEqual([]);
    expect(await session.merge_inbox()).toBe(0);

    const reopened = open_session(await unlock_phrase(files, created.ref, PHRASE));
    await reopened.load_index();
    expect(reopened.index.map((meta) => meta.id)).toEqual([id]);
  });

  test("a mood tap alone becomes an entry", async () => {
    const { created, ref } = await locked_ref();
    await add_to_inbox(files, ref, { date: "2026-10-22", created: 1, body: "", mood: 2 });
    const session = open_session(created);
    await session.merge_inbox();
    expect(session.index).toMatchObject([{ title: "Feeling bad", mood: 2, words: 0 }]);
  });

  test("a tampered or moved inbox item is refused and left alone; the rest merge", async () => {
    const { created, ref } = await locked_ref();
    const good = await add_to_inbox(files, ref, { date: "2026-10-22", created: 1, body: "fine" });
    const flipped = await add_to_inbox(files, ref, { date: "2026-10-22", created: 2, body: "flipped" });
    const moved = await add_to_inbox(files, ref, { date: "2026-10-22", created: 3, body: "moved" });
    const folder = inbox_path(ref);
    const bytes = (await read_bin(files, child(folder, `${flipped}.bin`)))!;
    bytes[bytes.length - 5] ^= 1;
    await write_bin(files, folder, `${flipped}.bin`, bytes);
    const other = "c".repeat(32);
    await write_bin(files, folder, `${other}.bin`, (await read_bin(files, child(folder, `${moved}.bin`)))!);
    await remove_bin(files, folder, `${moved}.bin`);

    const session = open_session(created);
    expect(await session.merge_inbox()).toBe(1);
    expect(session.unreadable).toBe(2);
    expect(session.index.map((meta) => meta.id)).toEqual([good]);
    expect((await inbox_names(folder)).sort()).toEqual([`${flipped}.bin`, `${other}.bin`].sort());
  });

  test("another journal's key can't open an item", async () => {
    const { ref } = await locked_ref("One");
    const two = await locked_ref("Two");
    const id = await add_to_inbox(files, ref, { date: "2026-10-22", created: 1, body: "for one" });
    await write_bin(files, inbox_path(two.ref), `${id}.bin`, (await read_bin(files, child(inbox_path(ref), `${id}.bin`)))!);
    const session = open_session(two.created);
    expect(await session.merge_inbox()).toBe(0);
    expect(session.unreadable).toBe(1);
  });

  test("activity names live in the encrypted index and survive entry saves", async () => {
    const created = await journal();
    const session = open_session(created);
    await session.set_activities(add_activity(session.activities, "Climbing", "exercise"));
    await session.save({ ...session.new_entry("2026-10-22", "x"), activities: [session.activities.at(-1)!.id] });
    const reopened = open_session(await unlock_phrase(files, created.ref, PHRASE));
    await reopened.load_index();
    expect(reopened.activities.at(-1)?.label).toBe("Climbing");
    expect(reopened.index[0].activities).toEqual([reopened.activities.at(-1)!.id]);
  });
});

describe("rename and delete", () => {
  let scheduler: SchedulerService;
  const booted: IService[] = [];

  beforeEach(async () => {
    kernel.services.set("files", files);
    for (const [name, service] of [
      ["notifications", new NotificationsService()],
      ["apps", stub_service("apps", { launch: vi.fn(), get: (id: string) => (id === APP_ID ? manifest : undefined), is_installed: () => true })],
      ["shell", stub_service("shell", { execute: vi.fn() })],
    ] as const) {
      kernel.services.set(name, service);
      booted.push(service);
    }
    scheduler = new SchedulerService(kernel);
    await scheduler.init();
    kernel.services.set("scheduler", scheduler);
    booted.push(scheduler);
    await vi.waitFor(() => expect(scheduler.is_leader).toBe(true));
  });

  afterEach(async () => {
    for (const service of booted.splice(0).reverse()) await service.destroy?.();
    for (const name of ["files", "notifications", "apps", "shell", "scheduler"]) kernel.services.delete(name);
  });

  test(
    "a renamed journal keeps its entries, its phrase, its quick unlock and its inbox",
    async () => {
      const created = await journal("Before");
      const session = open_session(created);
      const saved = await session.save(session.new_entry("2026-10-22", "written before"));
      await setup_quick(files, created.ref, PHRASE, { method: QuickMethod.PIN, secret: pin_secret("246810") });

      const renamed = await rename_journal(files, created.ref, "After");
      expect(renamed.path).toBe(`${JOURNAL_ROOT}/After`);
      expect(await files.get_directory(`${JOURNAL_ROOT}/Before`)).toBeNull();
      expect((await list_journals(files)).map((ref) => ref.name)).toEqual(["After"]);
      expect((await quick_state(files, renamed))?.gate).toBe(QuickGate.OPEN);

      await add_to_inbox(files, renamed, { date: "2026-10-22", created: Date.now(), body: "added while locked, after the rename" });

      const by_quick = open_session(await unlock_quick(files, renamed, pin_secret("246810")));
      await by_quick.load_index();
      await expect(by_quick.entry(saved.id)).resolves.toMatchObject({ body: "written before" });
      expect(await by_quick.merge_inbox()).toBe(1);

      const by_phrase = open_session(await unlock_phrase(files, renamed, PHRASE));
      await by_phrase.load_index();
      expect(by_phrase.index.map((meta) => meta.title).sort()).toEqual(["added while locked, after the rename", "written before"]);
    },
    SLOW
  );

  test(
    "deleting without unlocking removes the folder and this device's quick unlock; the reminder goes with the last journal",
    async () => {
      const one = await journal("One");
      const two = await journal("Two");
      await setup_quick(files, one.ref, PHRASE, { method: QuickMethod.PIN, secret: pin_secret("135790") });
      await setup_quick(files, two.ref, PHRASE, { method: QuickMethod.PIN, secret: pin_secret("246810") });
      await scheduler.schedule(APP_ID, { key: "reminder", title: "Time to write", at: { date: "2026-10-23", time: "21:00", tz: "UTC" }, repeat: { every: "day" }, kind: JobKind.REMINDER });

      const [listed_one] = await list_journals(files);
      await delete_journal(files, scheduler, { ...listed_one, header: null });
      expect(await files.get_directory(`${JOURNAL_ROOT}/One`)).toBeNull();
      expect(await read_quick(one.ref.header.id)).toBeUndefined();
      expect(await read_quick(two.ref.header.id)).toBeDefined();
      expect((await list_journals(files)).map((ref) => ref.name)).toEqual(["Two"]);
      expect(scheduler.get(REMINDER_JOB)).toBeDefined();
      await expect(unlock_quick(files, two.ref, pin_secret("246810"))).resolves.toMatchObject({ ref: { name: "Two" } });

      await delete_journal(files, scheduler, two.ref);
      expect(await list_journals(files)).toEqual([]);
      expect(await read_quick(two.ref.header.id)).toBeUndefined();
      expect(scheduler.get(REMINDER_JOB)).toBeUndefined();
    },
    SLOW
  );
});
