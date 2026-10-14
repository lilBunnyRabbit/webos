import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { GitDiff as GitDiffIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

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
  icon: GitDiffIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Compare two files or pasted texts side by side or inline.",
  keywords: ["compare", "difference", "diff", "merge", "changes", "text", "code", "versions"],
  tools: DIFF_ACCEPT,
  props: DIFF_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 280 } } },
  shell: {
    values: {
      "diff-stat": {
        columns: ["changes", "added", "removed"],
        text: (stat) => `${stat.changes} ${stat.changes === 1 ? "change" : "changes"}, +${stat.added} -${stat.removed}`,
        open: (stat) => void logic().then((m) => m.open_diff(String(stat.left), String(stat.right))),
      },
    },
    commands: [
      define_command({
        id: "diff",
        description: "Compare two files in Diff, or count the changes with --stat",
        args: z.object({
          left: arg.path(),
          right: arg.path(),
          stat: z.boolean().default(false).describe("Count changes, added and removed lines instead of opening Diff"),
        }),
        positional: ["left", "right"],
        yields: "diff-stat",
        run: async (context) => (await logic()).diff(context),
      }),
    ],
  },
  component: () => import("./diff.app.svelte"),
});
