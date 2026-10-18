export const APP_ID = "gw2";

export const Section = {
  TODAY: "today",
  WALLET: "wallet",
  INVENTORY: "inventory",
  GOALS: "goals",
  KEY: "key",
} as const;
export type Section = (typeof Section)[keyof typeof Section];

export const SECTION_IDS = Object.values(Section) as [Section, ...Section[]];

export const KEY_STORAGE = "key";
