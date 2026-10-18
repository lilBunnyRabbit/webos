import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Build and send HTTP requests, read the response, save requests as .http files and download to your files.",
  keywords: ["api", "http", "rest", "request", "fetch", "curl", "wget", "postman", "json", "download", "endpoint"],
  pitch: {
    problem: "Testing an API usually means installing a heavy desktop tool.",
    solution: "Build and send HTTP requests, read the response and save them as .http files.",
  },
} satisfies AppMeta;
