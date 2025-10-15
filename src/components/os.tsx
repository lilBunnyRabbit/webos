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
        "h-[100dvh] w-full overflow-hidden bg-background-dark grid",
        {
          top: "grid-cols-1 grid-rows-[auto_1fr]",
          bottom: "grid-cols-1 grid-rows-[1fr_auto]",
          left: "grid-cols-[auto_1fr] grid-rows-1",
          right: "grid-cols-[1fr_auto] grid-rows-1",
        }[taskbarPosition]
      )}
    >
      <div
        className="relative z-0 overflow-hidden p-4"
        style={{
          gridArea: {
            top: "2/1",
            bottom: "1/1",
            left: "1/2",
            right: "1/1",
          }[taskbarPosition],
        }}
      >
        <Desktop />
      </div>

      <WindowsContainerProvider
        className="relative z-0 pointer-events-none"
        style={{
          gridArea: {
            top: "2/1",
            bottom: "1/1",
            left: "1/2",
            right: "1/1",
          }[taskbarPosition],
        }}
      />

      <Taskbar
        className="z-[1]"
        style={{
          gridArea: {
            top: "1/1",
            bottom: "2/1",
            left: "1/1",
            right: "1/2",
          }[taskbarPosition],
        }}
      />
    </div>
  );
}
