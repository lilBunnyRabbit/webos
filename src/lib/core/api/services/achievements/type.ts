import type { IService } from "../../type";
import type { AppId } from "../apps/type";
import type { Achievement } from "./definition";

export type { Achievement };

export interface AchievementEntry {
  app_id: AppId;
  def: Achievement;
  unlocked: boolean;
  /** `null` while locked, and always for built-in ones: they're derived from usage, never stored. */
  unlocked_at: number | null;
  /** Capped at `def.goal`; 0 without one. */
  progress: number;
  /** "3 / 10", or "24 min / 1 h" for a built-in one; `null` without a goal. */
  progress_text: string | null;
  /** One of the active-time ones every app has (opened once, an hour, …). */
  builtin: boolean;
}

/**
 * Achievements apps declare and report (ADR-078), kept in `/var/lib/apps/{id}/achievements.json`. Every change
 * applies to the file under a per-app Web Lock, so two tabs never lose one, and an unlock toasts only in the tab where
 * it happened, once saved. Built-in active-time ones are derived and never toasted.
 */
export interface AchievementsService extends IService {
  /** Unknown ids warn and do nothing. */
  achieve(app_id: AppId, id: string): void;
  /** `n` is the running total toward `goal`, kept as the max seen. */
  progress(app_id: AppId, id: string, n: number): void;
  /**
   * The app's, declared then built-in; with no app, every app's that declares some or has been used, by app name.
   * Reactive: entries fill in as files and definitions load.
   */
  list(app_id?: AppId): AchievementEntry[];
  /** Resolves once queued changes are written. */
  idle(): Promise<void>;
}
