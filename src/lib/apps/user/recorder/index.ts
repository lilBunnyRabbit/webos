import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { RECORDER_PROPS } from "./props";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "recorder",
  name: "Recorder",
  icon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  props: RECORDER_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 380 },
    },
  },
  shell: () => import("./commands"),
  component: () => import("./recorder.app.svelte"),
});
