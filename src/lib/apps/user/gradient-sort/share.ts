import { format_time } from "$kit/games/time";
import { lines } from "../color-recall/share";

export function sort_share(head: string, ms: number, moves: number, link: string): string {
  return lines(`${head}  ${format_time(ms)} · ${moves} ${moves === 1 ? "move" : "moves"}`, link);
}
