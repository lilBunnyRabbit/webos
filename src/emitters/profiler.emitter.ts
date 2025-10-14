import type { AppId } from "@/apps";
import type { WindowId } from "@/contexts/windows";
import { EventEmitter } from "@lilbunnyrabbit/event-emitter";
import type { ProfilerOnRenderCallback } from "react";

export type ProfilerEvents = {
  render: {
    windowId: WindowId;
    appId: AppId;
    payload: Parameters<ProfilerOnRenderCallback>;
  };
};

// Ensure singleton across all chunks (main bundle + lazy-loaded apps)
// Without this, lazy-loaded apps get a separate EventEmitter instance
declare global {
  interface Window {
    __PROFILER_EMITTER__?: EventEmitter<ProfilerEvents>;
  }
}

if (typeof window !== "undefined" && !window.__PROFILER_EMITTER__) {
  window.__PROFILER_EMITTER__ = new EventEmitter<ProfilerEvents>();
}

export const profilerEmitter = (typeof window !== "undefined" 
  ? window.__PROFILER_EMITTER__! 
  : new EventEmitter<ProfilerEvents>());
