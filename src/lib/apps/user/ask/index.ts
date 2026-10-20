import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export const ASK_ACCEPT = [
  "text/*",
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".html",
  ".xml",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".log",
  ".ts",
  ".js",
  ".svelte",
  ".css",
];

export default define_app({
  id: "ask",
  name: "Ask",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  tools: ASK_ACCEPT,
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  highlights: () => import("./highlights"),
  shell: () => import("./commands"),
  component: () => import("./ask.app.svelte"),
});
