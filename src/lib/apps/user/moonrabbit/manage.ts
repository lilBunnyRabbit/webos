import type { WindowHandle } from "$lib/core/contexts/app";
import { clean_journal_name } from "./journal";
import type { JournalRef } from "./store";

export async function ask_delete(window: WindowHandle, name: string): Promise<boolean> {
  const sure = await window.confirm(`Delete “${name}”?`, {
    detail: "Every entry and photo in it is deleted from this device for good. Nobody can get them back, with or without the phrase.",
    confirm_label: "Delete…",
    danger: true,
  });
  if (!sure) return false;
  const typed = await window.prompt(`Type “${name}” to delete it`, {
    placeholder: name,
    confirm_label: "Delete journal",
    danger: true,
    validate: (value) => (value.trim() === name ? null : "That's not this journal's name."),
  });
  return typed !== null;
}

export function rename_error(value: string, current: string, journals: readonly JournalRef[]): string | null {
  const clean = clean_journal_name(value);
  if (!clean || clean !== value.trim()) return "A name can't start with a dot or use \\ / : * ? \" < > |.";
  if (journals.some((journal) => journal.name !== current && journal.name.toLowerCase() === clean.toLowerCase())) return "Another journal has that name.";
  return null;
}

export async function ask_rename(window: WindowHandle, current: string, journals: readonly JournalRef[]): Promise<string | null> {
  const name = await window.prompt("Rename journal", {
    initial: current,
    confirm_label: "Rename",
    validate: (value) => rename_error(value, current, journals),
  });
  return name && name !== current ? name : null;
}
