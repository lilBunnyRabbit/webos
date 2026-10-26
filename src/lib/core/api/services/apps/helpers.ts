import { z } from "zod";
import type { AppConfig, AppDefinition, AppId, AppProps } from "./type";
import { widget_size_schema } from "./widget";

/** Props schema for apps that open a path: an absolute OPFS path to a file (ADR-018) or, for File Explorer, a folder. */
export const FILE_PROPS = z.object({ path: z.string() });

/**
 * Installed on every device and never uninstalled (ADR-077, round 5). Every other app, system apps included, installs
 * and uninstalls like any app.
 */
export const CORE_APPS: readonly AppId[] = ["app-library", "settings", "file-explorer", "terminal"];

export function is_core_app(id: AppId): boolean {
  return CORE_APPS.includes(id);
}

/** Helper to define an app manifest with automatic .default extraction */
export function define_app<TProps extends AppProps = {}>(
  config: AppConfig<TProps>
): AppDefinition<TProps> {
  if (config.widget_size && !widget_size_schema.safeParse(config.widget_size).success) {
    throw new Error(`[define_app] ${config.id}: widget_size needs spans of 1–8 and min ≤ default ≤ max`);
  }
  return {
    ...config,
    defaults: config.defaults,
    component: () => config.component().then((m) => m.default),
  };
}
