import {
  Coin as CoinIcon,
  DiceFive as DiceFiveIcon,
  Hash as HashIcon,
  ListBullets as ListBulletsIcon,
  Password as PasswordIcon,
} from "phosphor-svelte";

export const SECTIONS = [
  { value: "number", label: "Number", icon: HashIcon },
  { value: "dice", label: "Dice", icon: DiceFiveIcon },
  { value: "coin", label: "Coin", icon: CoinIcon },
  { value: "list", label: "List", icon: ListBulletsIcon },
  { value: "password", label: "Password", icon: PasswordIcon },
] as const;

export type Section = (typeof SECTIONS)[number]["value"];

export const SECTION_IDS = SECTIONS.map((item) => item.value);
