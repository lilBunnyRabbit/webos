// Imports nothing from the OS: the build's Node step reads these types too (tooling/vite-plugin-catalogue.ts).

type AppId = string;

export const ChangeKind = {
  NEW: "new",
  IMPROVED: "improved",
  FIXED: "fixed",
} as const;
export type ChangeKind = (typeof ChangeKind)[keyof typeof ChangeKind];

export interface Change {
  kind: ChangeKind;
  /** User-facing wording, one sentence. */
  text: string;
  /** The apps this line is about; it shows in each one's history in the App Store (ADR-038). */
  apps?: AppId[];
}

/** One entry of the hand-written changelog (ADR-026). */
export interface Release {
  /** Semver; the newest entry equals `package.json`. */
  version: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
  changes: Change[];
  /** Apps that first shipped in this release. A device updating past it gets the app announcement (ADR-038). */
  introduces?: AppId[];
}

/** A release as `version.json` carries it for the update screen: no app lists. */
export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  changes: Pick<Change, "kind" | "text" | "apps">[];
}
