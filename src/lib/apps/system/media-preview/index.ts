import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FileImage as FileImageIcon } from "phosphor-svelte";

export default define_app({
  id: "media-preview",
  name: "Media Preview",
  icon: FileImageIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Views images and plays video and audio files.",
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
