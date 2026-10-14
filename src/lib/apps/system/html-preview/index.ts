import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FileHtml as FileHtmlIcon } from "phosphor-svelte";

export default define_app({
  id: "html-preview",
  name: "HTML Preview",
  icon: FileHtmlIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  keywords: ["html", "web page", "website", "preview", "browser", "render"],
  associations: ["text/html", ".html", ".htm"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 400 },
      height: { min: 300 },
    },
  },
  component: () => import("./html-preview.app.svelte"),
});
