import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export const DIFF_ACCEPT = [
  "text/*",
  ".txt",
  ".md",
  ".json",
  ".ts",
  ".js",
  ".svelte",
  ".css",
  ".html",
  ".xml",
  ".csv",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".log",
  ".env",
];

// `path` is what "Open with" passes; it becomes the left side.
export const DIFF_PROPS = z.object({
  left: z.string().optional(),
  right: z.string().optional(),
  path: z.string().optional(),
});

export default define_app({
  id: "diff",
  name: "Diff",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Compare two files or pasted texts side by side or inline.",
  keywords: ["compare", "difference", "diff", "merge", "changes", "text", "code", "versions"],
  tools: DIFF_ACCEPT,
  props: DIFF_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 280 } } },
  shell: () => import("./commands"),
  component: () => import("./diff.app.svelte"),
});
