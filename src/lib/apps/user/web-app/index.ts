import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Globe as GlobeIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "web-app",
  name: "Web App",
  icon: GlobeIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Keep a website on the desktop and open it in its own window.",
  keywords: ["website", "web", "url", "link", "bookmark", "browser", "iframe", "shortcut", "pwa"],
  associations: [".webapp"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 300 } } },
  shell: {
    commands: [
      define_command({
        id: "webapp add",
        description: "Save a website as a web app on the desktop",
        args: z.object({
          url: z.string().describe("The address; https:// is added when missing"),
          name: z.string().optional().describe("Name on the icon and the window, from the address by default"),
        }),
        positional: ["url"],
        short: { name: "n" },
        yields: "file",
        run: async (context) => (await logic()).add(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./web-app.app.svelte"),
});
