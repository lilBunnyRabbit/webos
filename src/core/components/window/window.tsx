import { ProfilerWrapper } from "@/core/components/profiler-wrapper";
import { WindowProvider } from "@/core/contexts/window";
import { useWindowManagerFlags, WindowFlag, WindowManagerFlag, type WindowInstance } from "@/core/contexts/window-manager";
import { cn } from "@/core/lib/utils";
import { WindowContent } from "./window-content";
import { WindowTitle } from "./window-title";

interface WindowProps {
  instance: WindowInstance;
}

export function Window({ instance }: WindowProps) {
  const flags = useWindowManagerFlags();
  const isMaximized = instance.flags.has(WindowFlag.MAXIMIZED);

  return (
    <WindowProvider
      instance={instance}
      className={cn(
        "bg-foreground shadow-window rounded-sm border-2 border-foreground grid grid-cols-1 grid-rows-[2.5rem_1fr] transition-colors",
        isMaximized && "rounded-none border-none",
        instance.snapZone && !isMaximized && "bg-primary border-primary",
        flags.has(WindowManagerFlag.PROFILER_ENABLED) && "bg-accent border-accent"
      )}
    >
      <WindowTitle instance={instance} />

      <WindowContent className={cn(isMaximized && "rounded-none")}>
        <ProfilerWrapper windowId={instance.id} appId={instance.app.id}>
          {instance.app.$node}
        </ProfilerWrapper>
      </WindowContent>
    </WindowProvider>
  );
}
