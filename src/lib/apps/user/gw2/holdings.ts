import { gw2_get, missing_scopes, Scope, type Character, type Slot } from "./api";
import { character_slots, tally, type Holding } from "./goals";

export interface Holdings {
  holdings: Holding[];
  equipped: Holding[];
  at: number;
  characters: boolean;
}

export const HOLDINGS_SCOPES = [Scope.INVENTORIES] as const;

export async function load_holdings(key: string, permissions: readonly string[], max_age?: number): Promise<Holdings> {
  const options = { key, max_age };
  const characters = missing_scopes(permissions, [Scope.CHARACTERS]).length === 0;
  const [bank, materials, shared, roster] = await Promise.all([
    gw2_get<(Slot | null)[]>("/account/bank", options),
    gw2_get<Slot[]>("/account/materials", options),
    gw2_get<(Slot | null)[]>("/account/inventory", options),
    characters ? gw2_get<Character[]>("/characters", { ...options, params: { ids: "all" } }) : null,
  ]);
  const holdings: Holding[] = [
    { label: "Bank", counts: tally(bank.data) },
    { label: "Materials", counts: tally(materials.data) },
    { label: "Shared slots", counts: tally(shared.data) },
    ...(roster?.data ?? []).map((character) => ({ label: character.name, counts: tally(character_slots(character)) })),
  ];
  const equipped = (roster?.data ?? []).map((character) => ({
    label: character.name,
    counts: tally((character.equipment ?? []).map((piece) => ({ id: piece.id, count: 1 }))),
  }));
  const at = Math.min(bank.at, materials.at, shared.at, roster?.at ?? Infinity);
  return { holdings, equipped, at, characters };
}
