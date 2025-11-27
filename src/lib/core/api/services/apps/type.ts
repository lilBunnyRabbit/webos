import type { Component } from "svelte";
import type { IService } from "../../type";
import type { WindowId, WindowOptions } from "../windows/type";

export interface AppsService extends IService {
  register(manifest: AppManifest): void;
  launch(id: AppId, props?: AppProps): WindowId;
  get(id: AppId): AppManifest | undefined;
  list(): IterableIterator<[AppId, AppManifest]>;
}

export type AppId = string;
export type AppCategory = "system" | "user" | `custom-${string}`;
export type AppProps<TProps extends Record<string, any> = {}> = TProps;

export interface AppManifest<TProps extends AppProps = AppProps> {
  id: AppId;
  name: string;
  description?: string;
  icon: Component;
  version: string;
  author?: string;
  categories: AppCategory[];
  window_options?: WindowOptions;
  component: () => Promise<Component<TProps>>;
}

export interface AppInstance<TProps extends AppProps = AppProps> {
  id: AppId;
  manifest: Omit<AppManifest, "component">;
  component: Promise<Component<TProps>>;
  props?: TProps;
  // window_ids: WindowId[];
}