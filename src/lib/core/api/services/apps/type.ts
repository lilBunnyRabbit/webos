import type { Component } from "svelte";
import type { ZodType } from "zod";
import type { IService } from "../../type";
import type { WindowId, WindowOptions } from "../windows/type";

export interface AppsService extends IService {
  register(manifest: AppManifest): void;
  /** Props are validated against the manifest's `props` schema; anything else is discarded (ADR-008). */
  launch(id: AppId, props?: unknown): WindowId;
  get(id: AppId): AppManifest | undefined;
  list(): IterableIterator<[AppId, AppManifest]>;
}

export type AppId = string;
export type AppCategory = "system" | "user" | `custom-${string}`;
export type AppProps = Record<string, unknown>;

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
  /** Without a schema the app never receives props. */
  props?: ZodType<TProps>;
  /** Every prop is optional: apps are also launched with none (start menu, desktop). */
  component: () => Promise<Component<Partial<TProps>>>;
}

/** Input type for define_app - categories optional, component returns module */
export interface AppConfig<TProps extends AppProps = AppProps>
  extends Omit<AppManifest<TProps>, "categories" | "component"> {
  categories?: AppCategory[];
  component: () => Promise<{ default: Component<Partial<NoInfer<TProps>>> }>;
}

export interface AppInstance<TProps extends AppProps = AppProps> {
  id: AppId;
  manifest: Omit<AppManifest, "component">;
  component: Promise<Component<Partial<TProps>>>;
  props?: TProps;
  // window_ids: WindowId[];
}