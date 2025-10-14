import type { AppId } from "@/apps";
import { useWindowsFlags, WindowsFlag, type WindowId } from "@/contexts/windows";
import { profilerEmitter } from "@/emitters/profiler.emitter";
import { Profiler } from "react";

interface ProfilerWrapperProps {
  windowId: WindowId;
  appId: AppId;
  children: React.ReactNode;
}

export const ProfilerWrapper = ({ windowId, appId, children }: ProfilerWrapperProps) => {
  const flags = useWindowsFlags();

  if (!flags.has(WindowsFlag.PROFILER_ENABLED)) {
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
