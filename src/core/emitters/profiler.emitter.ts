import type { AppId } from "@/apps";
import type { WindowId } from "@/core/contexts/window-manager";
import { EventEmitter } from "@lilbunnyrabbit/event-emitter";
import type { ProfilerOnRenderCallback } from "react";

export type ProfilerEvents = {
  render: {
    windowId: WindowId;
    appId: AppId;
    payload: Parameters<ProfilerOnRenderCallback>;
  };
};

export const profilerEmitter = new EventEmitter<ProfilerEvents>();
