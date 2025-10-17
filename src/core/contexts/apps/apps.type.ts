import type { AppId, AppsConfig } from "@/apps";
import type React from "react";


export interface AppInstance<Id extends AppId = AppId> {
  id: Id;
  name: string;
  icon: React.ComponentType<{ className?: string; }>;
  tags: readonly AppTag[];
  props: Parameters<AppsConfig[Id]["App"]>[0];
  $node: React.ReactNode;
}

export const AppTag = {
  UTILITY: "utility",
  GAME: "game",
  SYSTEM: "system",
} as const;

export type AppTag = (typeof AppTag)[keyof typeof AppTag];

