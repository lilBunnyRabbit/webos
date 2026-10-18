import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "See how a page's link looks in Slack, X, Facebook, Discord, LinkedIn and iMessage, and what to fix in its meta tags.",
  keywords: [
    "open graph",
    "og",
    "meta",
    "twitter card",
    "unfurl",
    "share",
    "social",
    "seo",
    "link",
    "preview",
    "slack",
    "discord",
    "linkedin",
    "imessage",
  ],
  pitch: {
    problem: "A shared link can look broken in Slack or on X, and you only find out once it's posted.",
    solution: "See how it looks in each app and which meta tags to fix.",
  },
} satisfies AppMeta;
