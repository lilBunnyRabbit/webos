import type { Component } from "svelte";
import type { IService } from "../../type";
import type { WindowId } from "../windows/type";

export interface AppsService extends IService {
  register(manifest: AppManifest): void;
  launch(id: AppId): WindowId;
}

export type AppId = string;

export interface AppManifest {
  id: AppId;
  name: string;
  component: () => Promise<Component>;
}

export interface AppInstance {
  id: AppId;
  manifest: Omit<AppManifest, "component">;
  component: Promise<Component>;
}