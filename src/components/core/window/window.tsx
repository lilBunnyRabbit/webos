import { WindowProvider } from "@/contexts/window";
import { WindowFlag, type WindowInstance } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { WindowContent } from "./window-content";
import { WindowTitle } from "./window-title";

interface WindowProps {
  instance: WindowInstance;
  isFocused: boolean;
  order: number;
}

export function Window({ instance, isFocused, order }: WindowProps) {
  const isMaximized = instance.flags.has(WindowFlag.MAXIMIZED);

  return (
    <WindowProvider
      instance={instance}
      order={order}
      className={cn(
        "bg-primary shadow-window rounded-sm border-2 border-primary  grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
        isFocused && "rounded-lg",
        isMaximized && "rounded-none border-none"
      )}
    >
      <WindowTitle instance={instance} />

      <WindowContent className={cn(isMaximized && "rounded-none")}>
        {instance.app.$node}
      </WindowContent>
    </WindowProvider>
  );
}
