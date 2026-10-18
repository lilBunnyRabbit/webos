import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "media-preview",
  name: "Media Preview",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Views images and plays video and audio files.",
  pitch: {
    problem: "You just want to look at a picture or play a clip, not open an editor.",
    solution: "Open images, video and audio straight from your files.",
  },
  keywords: ["image", "photo", "picture", "video", "audio", "music", "player", "viewer", "gallery"],
  associations: ["image/*", "video/*", "audio/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 400 },
      height: { min: 300 },
    },
  },
  component: () => import("./media-preview.app.svelte"),
});
