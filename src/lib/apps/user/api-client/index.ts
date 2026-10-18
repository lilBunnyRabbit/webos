import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { APP_ID, HTTP_FILES } from "./methods";
import AppIcon from "./icon.svelte";

export default define_app({
  id: APP_ID,
  name: "API Client",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description:
    "Build and send HTTP requests, read the response, save requests as .http files and download to your files.",
  pitch: {
    problem: "Testing an API usually means installing a heavy desktop tool.",
    solution: "Build and send HTTP requests, read the response and save them as .http files.",
  },
  keywords: ["api", "http", "rest", "request", "fetch", "curl", "wget", "postman", "json", "download", "endpoint"],
  associations: HTTP_FILES,
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./api-client.app.svelte"),
});
