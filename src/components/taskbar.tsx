import { useWindows, useWindowsActions, WindowFlag } from "@/contexts/windows";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings.store";
import { LayoutGridIcon } from "lucide-react";
import React from "react";
import { StartMenu } from "./start-menu";

export function Taskbar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { index, order } = useWindows();
  const dispatch = useWindowsActions();
  const taskbarPosition = useSettingsStore((state) => state.taskbar.position);

  // Determine orientation based on position
  const orientation = taskbarPosition === "left" || taskbarPosition === "right" ? "vertical" : "horizontal";

  return (
    <div
      className={cn(
        "grid flex-shrink-0",
        orientation === "vertical"
          ? "grid-cols-1 grid-rows-[auto_1fr_auto] items-end overflow-y-hidden"
          : "grid-cols-[auto_1fr_auto] grid-rows-1 items-end overflow-x-hidden",
        {
          bottom: "border-t",
          left: "border-r",
          right: "border-l",
          top: "border-b",
        }[taskbarPosition],
        "bg-background/40 backdrop-blur-xl shadow-2xl border-foreground/20",
        className
      )}
      style={style}
    >
      <div
        className={cn(
          "border-foreground/20",
          orientation === "vertical" ? "border-b py-2 px-1.5" : "border-r py-1.5 px-2"
        )}
      >
        <StartMenu>
          <button
            className={cn(
              "flex items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors rounded-sm w-10 h-10 data-[state=open]:bg-primary/20"
            )}
            title="Start"
          >
            <LayoutGridIcon className="w-6 h-6 text-primary" />
          </button>
        </StartMenu>
      </div>

      <div
        className={cn(
          "flex gap-1.5",
          {
            bottom: "flex-row w-full items-end overflow-x-auto py-1.5 px-2",
            left: "flex-col h-full items-start overflow-y-auto py-2 px-1.5",
            right: "flex-col h-full items-end overflow-y-auto py-2 px-1.5",
            top: "flex-row w-full items-start overflow-x-auto py-1.5 px-2",
          }[taskbarPosition]
        )}
      >
        {Object.entries(index)
          .sort((a, b) => a[1].createdAt.getTime() - b[1].createdAt.getTime())
          .map(([windowId, instance]) => {
            const IconComponent = instance.app.icon;
            const isFocused = order.isFocused(windowId);
            const isMinimized = instance.flags.has(WindowFlag.MINIMIZED);

            return (
              <button
                key={windowId}
                className={cn(
                  "group relative flex justify-center items-center rounded-sm transition-all duration-150 min-w-0 flex-shrink-0 w-10 h-10",
                  "hover:bg-foreground/10",
                  isFocused && !isMinimized && "text-primary",
                  !isMinimized && "bg-primary/10"
                )}
                onClick={() => {
                  if (isFocused) {
                    dispatch({ type: "TOGGLE_WINDOW", windowId });
                  } else {
                    dispatch({ type: "FOCUS_WINDOW", windowId });
                  }
                }}
                title={instance.app.name}
              >
                <IconComponent className="w-6 h-6" />
              </button>
            );
          })}
      </div>

      <div
        className={cn(
          "border-foreground/20 h-full flex items-center justify-center",
          orientation === "vertical" ? "border-t py-4 px-1.5" : "border-l py-1.5 px-4"
        )}
      >
        <DateTime />
      </div>
    </div>
  );
}

const DateTime = ({ className }: { className?: string }) => {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format time, e.g., "13:05:24" or with locale options if needed
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className={cn("flex flex-col items-end text-xs tabular-nums leading-tight select-none shrink-0", className)}>
      <div>{time}</div>
      <div className="opacity-70">{date}</div>
    </div>
  );
};
