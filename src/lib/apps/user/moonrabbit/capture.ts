import kernel, { type DialogsService, type FilesService } from "$lib/core/api";
import { day_key } from "$lib/core/utils/date";
import CaptureDialog, { type Capture } from "./capture-dialog.svelte";
import type { JournalHeader } from "./crypto";
import { add_to_inbox } from "./inbox";
import type { JournalRef } from "./store";

export type Writable = JournalRef & { header: JournalHeader };

export function writable(journals: readonly JournalRef[]): Writable[] {
  return journals.filter((journal): journal is Writable => journal.header !== null);
}

export interface Added {
  ref: Writable;
  id: string;
}

export async function add_line(files: FilesService, ref: Writable, text: string, mood?: number): Promise<Added> {
  const id = await add_to_inbox(files, ref, { date: day_key(), created: Date.now(), body: text, ...(mood ? { mood } : {}) });
  return { ref, id };
}

/** The capture box: the text lives only in the dialog until it's sealed into the inbox. */
export async function capture(files: FilesService, journals: readonly JournalRef[], preferred: string | null, mood?: number): Promise<Added | null> {
  const targets = writable(journals);
  if (!targets.length) return null;
  const names = targets.map((journal) => journal.name);
  const result = await kernel
    .service<DialogsService>("dialogs")
    .show<Capture, { journals: string[]; journal: string; mood?: number }>(CaptureDialog, {
      journals: names,
      journal: preferred && names.includes(preferred) ? preferred : names[0],
      mood,
    });
  const ref = result && targets.find((journal) => journal.name === result.journal);
  if (!result || !ref) return null;
  return add_line(files, ref, result.text, result.mood);
}
