import type { AppMeta } from "$lib/core/api";

export default {
  description: "Renders an HTML file safely in a sandbox, without running its scripts.",
  keywords: ["html", "web page", "website", "preview", "browser", "render"],
  pitch: {
    problem: "Opening a downloaded HTML file can run scripts you didn't ask for.",
    solution: "Render it in a sandbox, so you see the page without running its code.",
  },
} satisfies AppMeta;
