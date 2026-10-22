import type { FilesService, SchedulerService } from "$lib/core/api";
import {
  create_header,
  from_base64,
  lock_down,
  PBKDF2_ITERATIONS,
  random_bytes,
  RECOVERY_BYTES,
  rewrap_phrase,
  rewrap_recovery,
  seal_json,
  additional_data,
  format_recovery_code,
  Item,
  to_base64,
  unlock_with_phrase,
  unlock_with_recovery,
  verify_inbox_key,
  DecryptError,
  type JournalHeader,
} from "./crypto";
import { delete_quick, device_key, patch_quick, read_quick, write_quick } from "./device";
import { EMPTY_INDEX, HEADER_FILE, REMINDER_JOB } from "./journal";
import { create_passkey, passkey_prf } from "./passkey";
import {
  derive_passkey_key,
  derive_quick_key,
  MAX_ATTEMPTS,
  QUICK_ITERATIONS,
  quick_gate,
  QuickGate,
  QuickMethod,
  unwrap_quick,
  wrap_quick,
  type QuickRecord,
} from "./quick";
import { child, create_journal_folder, delete_journal_folder, list_journals, read_header, rename_journal_folder, write_header, type JournalRef } from "./store";

export interface Unlocked {
  ref: JournalRef & { header: JournalHeader };
  key: CryptoKey;
}

export class TamperedError extends Error {
  constructor() {
    super("This journal's header was changed outside Moonrabbit: its inbox key doesn't match. Nothing was opened.");
    this.name = "TamperedError";
  }
}

export async function create_journal(
  files: FilesService,
  name: string,
  phrase: string,
  recovery: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS
): Promise<Unlocked> {
  const { header, key } = await create_header(phrase, recovery, { iterations });
  const index = await seal_json(key, additional_data(header.id, Item.INDEX), EMPTY_INDEX);
  const ref = await create_journal_folder(files, name, header, index);
  return { ref: { ...ref, header }, key };
}

export function new_recovery(): { bytes: Uint8Array<ArrayBuffer>; code: Promise<string> } {
  const bytes = random_bytes(RECOVERY_BYTES);
  return { bytes, code: format_recovery_code(bytes) };
}

async function fresh(files: FilesService, ref: JournalRef): Promise<JournalRef & { header: JournalHeader }> {
  const read = await read_header(files, ref.path);
  if (!read?.header) throw new Error("This journal's header is missing or damaged");
  return { ...ref, header: read.header, stamp: read.stamp };
}

/** After the master phrase or the recovery code: this device trusts the header as it is now and the 7 days restart. */
async function trusted(ref: JournalRef & { header: JournalHeader }, key: CryptoKey): Promise<Unlocked> {
  if (!(await verify_inbox_key(ref.header, key))) throw new TamperedError();
  await patch_quick(ref.header.id, { master_at: Date.now(), header_stamp: ref.stamp, attempts: 0 });
  return { ref, key };
}

export async function unlock_phrase(files: FilesService, journal: JournalRef, phrase: string): Promise<Unlocked> {
  let ref = await fresh(files, journal);
  if (ref.header.kdf.iterations >= PBKDF2_ITERATIONS) return trusted(ref, await unlock_with_phrase(ref.header, phrase));
  const extractable = await unlock_with_phrase(ref.header, phrase, true);
  const header = await rewrap_phrase(ref.header, extractable, phrase);
  ref = { ...ref, header, stamp: await write_header(files, ref.path, header) };
  return trusted(ref, await lock_down(extractable));
}

export async function unlock_recovery(files: FilesService, journal: JournalRef, code: Uint8Array<ArrayBuffer>): Promise<Unlocked> {
  const ref = await fresh(files, journal);
  return trusted(ref, await unlock_with_recovery(ref.header, code));
}

export type MasterSecret = { phrase: string } | { recovery: Uint8Array<ArrayBuffer> };

async function extractable_key(header: JournalHeader, secret: MasterSecret): Promise<CryptoKey> {
  return "phrase" in secret ? unlock_with_phrase(header, secret.phrase, true) : unlock_with_recovery(header, secret.recovery, true);
}

async function save_header(files: FilesService, ref: JournalRef, header: JournalHeader): Promise<JournalRef & { header: JournalHeader }> {
  const stamp = await write_header(files, ref.path, header);
  await patch_quick(header.id, { header_stamp: stamp });
  return { ...ref, header, stamp };
}

export async function change_phrase(files: FilesService, journal: JournalRef, current: MasterSecret, phrase: string): Promise<JournalRef & { header: JournalHeader }> {
  const ref = await fresh(files, journal);
  return save_header(files, ref, await rewrap_phrase(ref.header, await extractable_key(ref.header, current), phrase));
}

export async function regenerate_recovery(
  files: FilesService,
  journal: JournalRef,
  current: MasterSecret
): Promise<{ ref: JournalRef & { header: JournalHeader }; code: string }> {
  const ref = await fresh(files, journal);
  const { bytes, code } = new_recovery();
  const header = await rewrap_recovery(ref.header, await extractable_key(ref.header, current), bytes);
  return { ref: await save_header(files, ref, header), code: await code };
}

export type QuickInput = { method: typeof QuickMethod.PIN | typeof QuickMethod.TAPS; secret: string; shuffle?: boolean } | { method: typeof QuickMethod.PASSKEY; label: string };

export async function setup_quick(files: FilesService, journal: JournalRef, phrase: string, input: QuickInput): Promise<QuickRecord> {
  const ref = await fresh(files, journal);
  const data_key = await unlock_with_phrase(ref.header, phrase, true);
  const base = { journal_id: ref.header.id, attempts: 0, master_at: Date.now(), header_stamp: ref.stamp };
  let record: QuickRecord;
  if (input.method === QuickMethod.PASSKEY) {
    const salt = random_bytes(32);
    const { credential_id, prf } = await create_passkey(input.label, salt);
    const kek = await derive_passkey_key(prf, salt);
    record = { ...base, method: input.method, salt: to_base64(salt), iterations: 0, credential_id, wrapped: await wrap_quick(data_key, kek, ref.header.id, input.method) };
  } else {
    const salt = random_bytes(16);
    const kek = await derive_quick_key(await device_key(), input.secret, salt, QUICK_ITERATIONS);
    record = {
      ...base,
      method: input.method,
      salt: to_base64(salt),
      iterations: QUICK_ITERATIONS,
      shuffle: input.shuffle,
      wrapped: await wrap_quick(data_key, kek, ref.header.id, input.method),
    };
  }
  await write_quick(record);
  return record;
}

export const remove_quick = delete_quick;

export interface QuickState {
  record: QuickRecord;
  gate: QuickGate;
}

export async function quick_state(files: FilesService, journal: JournalRef): Promise<QuickState | null> {
  const read = await read_header(files, journal.path);
  if (!read?.header) return null;
  const record = await read_quick(read.header.id);
  return record ? { record, gate: quick_gate(record, read.stamp) } : null;
}

export class WrongQuickError extends Error {
  constructor(readonly left: number) {
    super(left > 0 ? `That's not it. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong tries. Quick unlock was removed; use your master phrase.");
    this.name = "WrongQuickError";
  }
}

export class QuickClosedError extends Error {
  constructor(readonly gate: QuickGate) {
    super(
      gate === QuickGate.EXPIRED
        ? "It's been a week: unlock with your master phrase once."
        : gate === QuickGate.RESTORED
          ? "This journal was restored or changed outside Moonrabbit: unlock with your master phrase."
          : "Quick unlock was removed after too many wrong tries."
    );
    this.name = "QuickClosedError";
  }
}

/** Five wrong tries delete the wrap, so guessing on this device stops at five whatever the rate. */
export async function unlock_quick(files: FilesService, journal: JournalRef, secret: string | null): Promise<Unlocked> {
  const ref = await fresh(files, journal);
  const record = await read_quick(ref.header.id);
  if (!record) throw new QuickClosedError(QuickGate.LOCKED_OUT);
  const gate = quick_gate(record, ref.stamp);
  if (gate !== QuickGate.OPEN) throw new QuickClosedError(gate);
  const salt = from_base64(record.salt);
  const kek =
    record.method === QuickMethod.PASSKEY
      ? await derive_passkey_key(await passkey_prf(record.credential_id ?? "", salt), salt)
      : await derive_quick_key(await device_key(), secret ?? "", salt, record.iterations);
  try {
    const key = await unwrap_quick(record, kek);
    if (!(await verify_inbox_key(ref.header, key))) throw new TamperedError();
    if (record.attempts) await patch_quick(record.journal_id, { attempts: 0 });
    return { ref, key };
  } catch (reason) {
    if (!(reason instanceof DecryptError)) throw reason;
    const attempts = record.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) await delete_quick(record.journal_id);
    else await patch_quick(record.journal_id, { attempts });
    throw new WrongQuickError(MAX_ATTEMPTS - attempts);
  }
}

/** No secret asked: anyone at this device can delete the folder in Files anyway, and a lost phrase mustn't trap it. */
export async function delete_journal(files: FilesService, scheduler: SchedulerService, journal: JournalRef): Promise<void> {
  const id = journal.header?.id ?? (await read_header(files, journal.path))?.header?.id;
  await delete_journal_folder(files, journal);
  if (id) await delete_quick(id);
  if ((await list_journals(files)).length === 0) await scheduler.cancel(REMINDER_JOB);
}

/**
 * The copy gives `journal.json` a new `lastModified`, which would read as a restore and pause quick unlock. The stamp
 * moves along only when the record trusted the header before and the header is the same text after.
 */
export async function rename_journal<T extends JournalRef>(files: FilesService, journal: T, name: string): Promise<T> {
  const before = await files.get_file(child(journal.path, HEADER_FILE));
  const text = before ? await before.text() : null;
  const renamed = { ...journal, ...(await rename_journal_folder(files, journal, name)) };
  const after = await files.get_file(child(renamed.path, HEADER_FILE));
  const id = journal.header?.id;
  if (!before || !after || !id || (await after.text()) !== text) return renamed;
  const record = await read_quick(id);
  if (record?.header_stamp === before.lastModified) await patch_quick(id, { header_stamp: after.lastModified });
  return { ...renamed, stamp: after.lastModified };
}
