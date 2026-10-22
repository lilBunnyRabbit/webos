export interface Lockable {
  readonly id: string;
  lock(): void;
}

const unlocked = new Set<Lockable>();

export function track_unlocked(session: Lockable): () => void {
  unlocked.add(session);
  return () => unlocked.delete(session);
}

export function lock_all(): number {
  const sessions = [...unlocked];
  for (const session of sessions) session.lock();
  return sessions.length;
}

/** Other windows hold the journal's old path; locking them is simpler than moving their open editors along. */
export function lock_journal(id: string, except?: Lockable): void {
  for (const session of [...unlocked]) if (session.id === id && session !== except) session.lock();
}
