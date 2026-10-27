import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { RECORDER_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "recorder",
  name: "Recorder",
  icon: AppIcon,
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  props: RECORDER_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 380 },
    },
  },
  achievements: [
    { id: "voice", title: "Testing, testing", text: "Save a voice recording." },
    { id: "screen", title: "Show and tell", text: "Save a screen recording." },
    { id: "camera", title: "Rolling", text: "Save a camera video." },
    { id: "photo", title: "Say cheese", text: "Save a photo." },
  ],
  shell: () => import("./commands"),
  component: () => import("./recorder.app.svelte"),
});
