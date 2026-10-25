import { lines } from "../color-recall/share";

export function odd_share(head: string, hits: number, misses: number, link: string): string {
  return lines(`${head}  ${hits} found`, misses ? `${misses} missed` : "No misses", link);
}
