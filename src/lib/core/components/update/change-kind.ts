import { ChangeKind } from "$lib/core/api";

const KINDS = {
  [ChangeKind.NEW]: { label: "New", tone: "primary" },
  [ChangeKind.IMPROVED]: { label: "Improved", tone: "info" },
  [ChangeKind.FIXED]: { label: "Fixed", tone: "success" },
} as const;

/** Badge label and tone for a release note's kind. Notes come unvalidated from a newer build's `version.json`, so an unknown kind still renders. */
export function change_kind(kind: string): { label: string; tone?: (typeof KINDS)[ChangeKind]["tone"] } {
  return KINDS[kind as ChangeKind] ?? { label: kind };
}
