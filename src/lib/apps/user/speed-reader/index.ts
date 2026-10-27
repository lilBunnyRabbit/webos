import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "speed-reader",
  name: "Speed Reader",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  tools: ["text/plain", ".txt", ".md"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 300 } } },
  achievements: [
    { id: "the-end", title: "The end", text: "Read a text through to its last word." },
    { id: "fast", title: "Skimmer", text: "Read 300 words in one go at 600 words a minute or faster." },
    { id: "words-10000", title: "Bookworm", text: "Read 10,000 words.", goal: 10000 },
  ],
  component: () => import("./speed-reader.app.svelte"),
});
