import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "link-preview",
  name: "Link Preview",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description:
    "See how a page's link looks in Slack, X, Facebook, Discord, LinkedIn and iMessage, and what to fix in its meta tags.",
  pitch: {
    problem: "A shared link can look broken in Slack or on X, and you only find out once it's posted.",
    solution: "See how it looks in each app and which meta tags to fix.",
  },
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
  tools: ["text/html", ".html", ".htm"],
  props: z.object({ path: z.string().optional(), url: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  highlights: () => import("./highlights"),
  component: () => import("./link-preview.app.svelte"),
});
