import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Backpack as BackpackIcon, CalendarCheck as CalendarCheckIcon, Coins as CoinsIcon, Key as KeyIcon, Target as TargetIcon } from "phosphor-svelte";

export default [
  { icon: CalendarCheckIcon, title: "Wizard's Vault", text: "Daily, weekly and special objectives with progress, plus today's world bosses." },
  { icon: CoinsIcon, title: "Wallet", text: "Every currency you hold, gold shown as gold, silver and copper." },
  { icon: BackpackIcon, title: "Inventory", text: "Search everything you own at once and see how many sit in the bank, materials, shared slots and each character." },
  { icon: TargetIcon, title: "Crafting goals", text: "Pick an item and a target; progress counts your bank, materials and bags." },
  { icon: KeyIcon, title: "Your key stays here", text: "The API key is kept in this browser only. A read-only key is all it needs." },
] satisfies AppHighlight[];
