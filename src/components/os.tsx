import { WindowsContainerProvider } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings.store";
import { Desktop } from "./core/desktop/desktop";
import { Taskbar } from "./taskbar";

export function OS() {
  const taskbarPosition = useSettingsStore((state) => state.taskbar.position);

  return (
    <div
      className={cn(
        "flex h-[100dvh] w-full overflow-hidden bg-background-dark",
        {
          bottom: "flex-col",
          left: "flex-row-reverse",
          right: "flex-row",
          top: "flex-col-reverse",
        }[taskbarPosition]
      )}
    >
      <WindowsContainerProvider className="relative p-8 overflow-hidden flex-1">
        <Desktop />
      </WindowsContainerProvider>

      <Taskbar />
    </div>
  );
}
