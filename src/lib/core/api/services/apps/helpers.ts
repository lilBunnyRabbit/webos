import { z } from "zod";
import type { AppConfig, AppDefinition, AppProps } from "./type";
import { widget_size_schema } from "./widget";

/** Props schema for apps that open a path: an absolute OPFS path to a file (ADR-018) or, for File Explorer, a folder. */
export const FILE_PROPS = z.object({ path: z.string() });

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
