/** Declared in the manifest (`define_app({ achievements })`, ADR-078) as plain data, so the build can copy it. */
export interface Achievement {
  /** Unique within the app; `os.` is taken by the built-in ones. */
  id: string;
  title: string;
  /** How to earn it. Shown as "Secret" until unlocked when `secret`. */
  text: string;
  /** A whole number above 0: `progress(id, n)` unlocks it on reaching this. */
  goal?: number;
  secret?: boolean;
}
