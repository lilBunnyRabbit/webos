import { pad2 } from "$lib/core/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function format_added(added_at: number, now = Date.now()): string {
  const then = new Date(added_at);
  const today = new Date(now);
  const time = `${pad2(then.getHours())}:${pad2(then.getMinutes())}`;
  // Rounded: a day with a daylight saving change is 23 or 25 hours long.
  const days = Math.round((midnight(today) - midnight(then)) / DAY_MS);
  let day: string;
  if (days === 0) day = "today";
  else if (days === 1) day = "yesterday";
  else if (days > 1 && days < 7) day = then.toLocaleDateString("en-US", { weekday: "short" });
  else {
    // en-US month names: en-GB writes September as "Sept".
    day = `${then.getDate()} ${then.toLocaleDateString("en-US", { month: "short" })}`;
    if (then.getFullYear() !== today.getFullYear()) day += ` ${then.getFullYear()}`;
  }
  return `Added ${day}, ${time}`;
}
