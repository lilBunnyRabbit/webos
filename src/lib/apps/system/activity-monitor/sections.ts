import {
  AppWindow as AppWindowIcon,
  Broadcast as BroadcastIcon,
  Gauge as GaugeIcon,
  HardDrives as HardDrivesIcon,
  ListChecks as ListChecksIcon,
  SquaresFour as SquaresFourIcon,
  WifiHigh as WifiHighIcon,
} from "phosphor-svelte";

export const SECTIONS = [
  { value: "windows", label: "Windows", icon: AppWindowIcon },
  { value: "widgets", label: "Widgets", icon: SquaresFourIcon },
  { value: "performance", label: "Performance", icon: GaugeIcon },
  { value: "network", label: "Network", icon: WifiHighIcon },
  { value: "storage", label: "Storage", icon: HardDrivesIcon },
  { value: "tasks", label: "Tasks", icon: ListChecksIcon },
  { value: "background", label: "Background", icon: BroadcastIcon },
] as const;

export type Section = (typeof SECTIONS)[number]["value"];

export const SECTION_IDS = SECTIONS.map((item) => item.value);
