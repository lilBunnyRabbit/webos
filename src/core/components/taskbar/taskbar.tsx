import { useWindowManager, useWindowManagerActions, WindowFlag } from "@/core/contexts/window-manager";
import { cn } from "@/core/lib/utils";
import { useSettingsStore } from "@/core/stores/settings.store";
import { LayoutGridIcon } from "lucide-react";
import React from "react";
import { StartMenu } from "./start-menu";
import { TaskbarItem } from "./taskbar-item";
import { DateTime } from "./date-time";

interface TaskbarProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Taskbar({ className, style }: TaskbarProps) {
  const { index, order } = useWindowManager();
  const dispatch = useWindowManagerActions();
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
          <TaskbarItem title="Start">
            <LayoutGridIcon className="text-primary" />
          </TaskbarItem>
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
              <TaskbarItem
                key={windowId}
                title={instance.app.name}
                isFocused={isFocused}
                isMinimized={isMinimized}
                onClick={() => {
                  if (isFocused) {
                    dispatch({ type: "TOGGLE_WINDOW", windowId });
                  } else {
                    dispatch({ type: "FOCUS_WINDOW", windowId });
                  }
                }}
              >
                <IconComponent />
              </TaskbarItem>
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

