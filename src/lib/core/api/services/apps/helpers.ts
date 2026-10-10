import type { AppConfig, AppManifest, AppProps } from "./type";

/** Helper to define an app manifest with automatic .default extraction */
export function define_app<TProps extends AppProps = {}>(
  config: AppConfig<TProps>
): AppManifest<TProps> {
  return {
    ...config,
    categories: config.categories ?? ["user"],
    defaults: config.defaults,
    component: () => config.component().then((m) => m.default),
  };
}
