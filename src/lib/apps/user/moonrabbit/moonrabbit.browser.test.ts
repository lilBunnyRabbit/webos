import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clear_opfs, get_root } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { DecryptError, PBKDF2_ITERATIONS, random_bytes, RECOVERY_BYTES, unlock_with_phrase } from "./crypto";
import { delete_quick, device_key, read_quick } from "./device";
import { ENTRIES_DIR, HEADER_FILE, INDEX_FILE, JOURNAL_ROOT, media_token } from "./journal";
import { MAX_ATTEMPTS, pin_secret, QuickGate, QuickMethod, taps_secret } from "./quick";
import { JournalSession, LockedError } from "./session.svelte";
import { lock_all } from "./sessions";
import { child, list_journals, read_bin, write_bin, write_header } from "./store";
import {
  change_phrase,
  create_journal,
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
      await regenerate_recovery(files, created.ref, { phrase: PHRASE });
      await change_phrase(files, created.ref, { phrase: PHRASE }, `${PHRASE} moon`);

      const needles = [MARKER, MARKER.toLowerCase(), PHRASE, "acorn"].map((text) => new TextEncoder().encode(text));
      const written = await every_file(await get_root());
      expect(written.some((file) => file.path.endsWith(".bin"))).toBe(true);
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
