export const CharSet = {
  BASIC_LATIN: "basic-latin",
  CENTRAL_EUROPEAN: "central-european",
  LATIN_1: "latin-1",
  SYMBOLS: "symbols",
} as const;
export type CharSet = (typeof CharSet)[keyof typeof CharSet];

export const CHAR_SETS = Object.values(CharSet) as [CharSet, ...CharSet[]];

export const CHAR_SET_LABELS: Record<CharSet, string> = {
  [CharSet.BASIC_LATIN]: "Basic Latin",
  [CharSet.CENTRAL_EUROPEAN]: "Central European",
  [CharSet.LATIN_1]: "Latin-1 accents",
  [CharSet.SYMBOLS]: "Symbols",
};

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => String.fromCodePoint(from + index));

const BASIC_LATIN = [
  ...range(0x41, 0x5a),
  ...range(0x61, 0x7a),
  ...range(0x30, 0x39),
  ..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
];

const CENTRAL_EUROPEAN = [..."ĄąĆćČčĎďĐđĘęĚěĹĺĽľŁłŃńŇňŐőŔŕŘřŚśŠšŞşŢţŤťŮůŰűŹźŻżŽžÁáÂâĂăÄäÉéËëÍíÎîÓóÔôÖöÚúÜüÝýßȘșȚț"];

const LATIN_1 = [...range(0xa1, 0xac), ...range(0xae, 0xff)];

const SYMBOLS = [..."–—‘’‚“”„…•†‡‰‹›€™←↑→↓↔≈≠≤≥∞√∑πΩ♥★☆✓✗☺♪№"];

const CHARACTERS: Record<CharSet, string[]> = {
  [CharSet.BASIC_LATIN]: BASIC_LATIN,
  [CharSet.CENTRAL_EUROPEAN]: CENTRAL_EUROPEAN,
  [CharSet.LATIN_1]: LATIN_1,
  [CharSet.SYMBOLS]: SYMBOLS,
};

export function set_characters(set: CharSet): readonly string[] {
  return CHARACTERS[set];
}

export function project_characters(sets: readonly CharSet[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const set of CHAR_SETS) {
    if (!sets.includes(set)) continue;
    for (const char of CHARACTERS[set]) {
      if (seen.has(char)) continue;
      seen.add(char);
      out.push(char);
    }
  }
  return out;
}
