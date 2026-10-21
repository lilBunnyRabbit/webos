import { execFileSync } from "node:child_process";

type ChangeKind = "new" | "improved" | "fixed";

interface Release {
  version: string;
  date: string;
  title: string;
  changes: { kind: ChangeKind; text: string }[];
}

const WHATS_NEW = "https://lilbunnyrabbit.github.io/webos/#/app/settings?section=whats-new";
const COLOR = 0xa4b483;
const EMBEDS_PER_MESSAGE = 10;
// Loaded by path so tsc (node config) doesn't follow the app's browser types behind it.
const CHANGELOG_PATH = "../src/lib/core/api/services/version/changelog.ts";
const { CHANGELOG } = (await import(CHANGELOG_PATH)) as { CHANGELOG: Release[] };
const HEADINGS: Record<ChangeKind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };

interface Embed {
  title: string;
  url: string;
  description: string;
  color: number;
  footer: { text: string };
}

function last_posted(): string | null {
  const tags = execFileSync("git", ["tag", "--list", "v*", "--sort=-v:refname"], { encoding: "utf8" });
  const top = tags.split("\n").find((tag) => tag.trim() !== "");
  return top ? top.trim().slice(1) : null;
}

/** Oldest first, so the channel reads in release order. An unknown marker posts only the newest entry rather than the whole history. */
function unposted(last: string | null): Release[] {
  const index = last === null ? -1 : CHANGELOG.findIndex((release) => release.version === last);
  return (index === -1 ? CHANGELOG.slice(0, 1) : CHANGELOG.slice(0, index)).reverse();
}

function embed(release: Release): Embed {
  const sections = (Object.keys(HEADINGS) as ChangeKind[])
    .map((kind) => {
      const lines = release.changes.filter((change) => change.kind === kind).map((change) => `• ${change.text}`);
      return lines.length > 0 ? `**${HEADINGS[kind]}**\n${lines.join("\n")}` : "";
    })
    .filter((section) => section !== "");
  return {
    title: `${release.title} · v${release.version}`,
    url: WHATS_NEW,
    description: sections.join("\n\n").slice(0, 4096),
    color: COLOR,
    footer: { text: release.date },
  };
}

const releases = unposted(last_posted());
const embeds = releases.map(embed);
if (embeds.length === 0) {
  console.log("discord: nothing new to post");
  process.exit(0);
}

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (process.argv.includes("--dry") || !webhook) {
  console.log(JSON.stringify(embeds, null, 2));
  if (!webhook && !process.argv.includes("--dry")) console.log("discord: DISCORD_WEBHOOK_URL is not set, nothing posted");
  process.exit(0);
}

for (let start = 0; start < embeds.length; start += EMBEDS_PER_MESSAGE) {
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ embeds: embeds.slice(start, start + EMBEDS_PER_MESSAGE), allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) {
    console.error(`discord: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
}
// The tag is the "posted" marker: pushed only after every post succeeded, so a failure retries on the next deploy.
const marker = `v${CHANGELOG[0].version}`;
execFileSync("git", ["tag", marker]);
execFileSync("git", ["push", "origin", marker]);
console.log(`discord: posted ${releases.map((release) => release.version).join(", ")}, tagged ${marker}`);
