export const Platform = {
  SLACK: "slack",
  TWITTER: "twitter",
  FACEBOOK: "facebook",
  DISCORD: "discord",
  LINKEDIN: "linkedin",
  IMESSAGE: "imessage",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export interface PlatformInfo {
  name: string;
  bot: string;
  docs: string;
}

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  slack: { name: "Slack", bot: "Slackbot-LinkExpanding 1.0", docs: "https://api.slack.com/robots" },
  twitter: { name: "X / Twitter", bot: "Twitterbot/1.0", docs: "https://developer.x.com/en/docs/x-for-websites/cards/overview/abouts-cards" },
  facebook: { name: "Facebook / Messenger", bot: "facebookexternalhit/1.1", docs: "https://developers.facebook.com/docs/sharing/webmasters" },
  discord: { name: "Discord", bot: "Discordbot/2.0", docs: "https://discord.com/developers/docs/resources/message#embed-object" },
  linkedin: { name: "LinkedIn", bot: "LinkedInBot/1.0", docs: "https://www.linkedin.com/help/linkedin/answer/a521928" },
  imessage: { name: "iMessage", bot: "Apple LinkPresentation (Safari-like)", docs: "https://developer.apple.com/library/archive/technotes/tn2444/_index.html" },
};
