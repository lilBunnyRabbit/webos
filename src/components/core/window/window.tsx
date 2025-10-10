import { WindowProvider } from "@/contexts/window";
import { type WindowInstance } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import React from "react";
import { WindowContent } from "./window-content";
import { WindowTitle } from "./window-title";

interface WindowProps {
  instance: WindowInstance & { app: React.ReactNode };
  isFocused: boolean;
  order: number;
}

export function Window({ instance, isFocused, order }: WindowProps) {
  return (
    <WindowProvider
      instance={instance}
      order={order}
      className={cn(
        "bg-primary shadow-window rounded-sm border-2 border-primary  grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
        isFocused && "rounded-lg",
        instance.isMaximized && "rounded-none border-none"
      )}
    >
      <WindowTitle instance={instance} />

      <WindowContent className={cn(instance.isMaximized && "rounded-none")}>{instance.app}</WindowContent>
    </WindowProvider>
  );
}
