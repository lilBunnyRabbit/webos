import { WindowsContainerProvider } from "@/contexts/windows";
import { Desktop } from "./core/desktop/desktop";
import { Taskbar } from "./taskbar";
import { useState } from "react";

export function OS() {
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">("horizontal");

  const toggleOrientation = () => {
    setOrientation((prev) => (prev === "vertical" ? "horizontal" : "vertical"));
  };

  return (
    <div className={`flex ${orientation === "vertical" ? "flex-row" : "flex-col-reverse"} h-[100dvh] w-full overflow-hidden bg-background-dark`}>
      <Taskbar orientation={orientation} onToggleOrientation={toggleOrientation} />

      <WindowsContainerProvider className="relative p-8 overflow-hidden flex-1">
        <Desktop />
      </WindowsContainerProvider>
    </div>
  );
}
