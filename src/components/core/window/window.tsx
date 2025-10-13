import { WindowProvider } from "@/contexts/window";
import { WindowFlag, type WindowInstance } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { WindowContent } from "./window-content";
import { WindowTitle } from "./window-title";

interface WindowProps {
  instance: WindowInstance;
}

export function Window({ instance }: WindowProps) {
  const isMaximized = instance.flags.has(WindowFlag.MAXIMIZED);

  return (
    <WindowProvider
      instance={instance}
      className={cn(
        "bg-foreground shadow-window rounded-sm border-2 border-foreground grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
        isMaximized && "rounded-none border-none",
        instance.config.snapZone && !isMaximized && "bg-primary border-primary"
      )}
    >
      <WindowTitle instance={instance} />

      <WindowContent className={cn(isMaximized && "rounded-none")}>{instance.app.$node}</WindowContent>
    </WindowProvider>
  );
}
