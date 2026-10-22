import { DISMISSED_KEY, parse_dismissed } from "./check";

// Storage can throw (blocked site data, some private windows); the check then simply shows every time.
export function read_dismissed(): string[] {
  try {
    return parse_dismissed(localStorage.getItem(DISMISSED_KEY));
  } catch {
    return [];
  }
}

export function write_dismissed(ids: string[]): void {
  try {
    if (ids.length > 0) localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
    else localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // Nothing to keep it in: the screen shows again next time.
  }
}
