import type { AppId } from "@/apps";
import { useWindowManagerFlags, WindowManagerFlag, type WindowId } from "@/core/contexts/window-manager";
import { profilerEmitter } from "@/core/emitters/profiler.emitter";
import { Profiler } from "react";

interface ProfilerWrapperProps {
  windowId: WindowId;
  appId: AppId;
  children: React.ReactNode;
}
// TODO: this doesnt work in production
export const ProfilerWrapper = ({ windowId, appId, children }: ProfilerWrapperProps) => {
  const flags = useWindowManagerFlags();

  if (!flags.has(WindowManagerFlag.PROFILER_ENABLED)) {
    return children;
  }

  return (
    <Profiler
      id={`${appId}-${windowId}`}
      onRender={(...payload) => {
        profilerEmitter.emit("render", {
          windowId,
          appId,
          payload,
        });
      }}
    >
      {children}
    </Profiler>
  );
};
