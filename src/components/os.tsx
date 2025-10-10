import { WindowsContainerProvider } from "@/contexts/windows";
import { Desktop } from "./core/desktop/desktop";
import { Taskbar } from "./taskbar";

export function OS() {
  return (
    <div className="grid grid-cols-1 grid-rows-[1fr_min-content] h-[100dvh] w-full overflow-hidden bg-background-dark">
      <WindowsContainerProvider className="relative p-8 overflow-hidden">
        <Desktop />
      </WindowsContainerProvider>

      <Taskbar />
    </div>
  );
}
