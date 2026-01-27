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

/** Resolved app manifest with normalized fields */
export interface AppManifest<TProps extends AppProps = AppProps> {
  id: AppId;
  name: string;
  version: string;
  icon: Component;
  description?: string;
  categories: AppCategory[];
  keywords?: string[];
  author?: string;
  license?: string;
  repository?: string;
  defaults?: WindowOptions;
  component: () => Promise<Component<TProps>>;
}

/** Input type for defineApp - categories optional, component returns module */
export interface AppConfig<TProps extends AppProps = AppProps>
  extends Omit<AppManifest<TProps>, "categories" | "component"> {
  categories?: AppCategory[];
  component: () => Promise<{ default: Component<TProps> }>;
}

export interface AppInstance<TProps extends AppProps = AppProps> {
  id: AppId;
  manifest: Omit<AppManifest, "component">;
  component: Promise<Component<TProps>>;
  props?: TProps;
  // window_ids: WindowId[];
}