import type { VersionInfo } from "$lib/core/api";

export const REPOSITORY = "https://github.com/lilbunnyrabbit/webos";

export const FeedbackKind = {
  FEATURE: "feature",
  BUG: "bug",
  PROPOSAL: "proposal",
} as const;
export type FeedbackKind = (typeof FeedbackKind)[keyof typeof FeedbackKind];

/** GitHub issue forms fill a field from the query parameter named by its `id` (`.github/ISSUE_TEMPLATE`). */
export function issue_url(kind: FeedbackKind, info: Pick<VersionInfo, "version" | "commit">, platform: string): string {
  const params = new URLSearchParams({ template: `${kind}.yml`, version: `${info.version} (${info.commit})` });
  if (kind === FeedbackKind.BUG) params.set("platform", platform);
  return `${REPOSITORY}/issues/new?${params}`;
}
