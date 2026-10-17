import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { PaperPlaneTilt as PaperPlaneTiltIcon } from "phosphor-svelte";
import { z } from "zod";
import { APP_ID, HTTP_FILES } from "./methods";

export default define_app({
  id: APP_ID,
  name: "API Client",
  icon: PaperPlaneTiltIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Build and send HTTP requests, read the response, save requests as .http files and download to your files.",
  keywords: ["api", "http", "rest", "request", "fetch", "curl", "wget", "postman", "json", "download", "endpoint"],
  associations: HTTP_FILES,
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./api-client.app.svelte"),
});
