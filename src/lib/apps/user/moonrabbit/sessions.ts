export interface Lockable {
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
