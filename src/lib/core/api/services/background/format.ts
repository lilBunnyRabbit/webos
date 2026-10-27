export function format_since(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} d`;
}
