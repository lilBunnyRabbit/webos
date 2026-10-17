import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Record as RecordIcon } from "phosphor-svelte";
import { RECORDER_PROPS } from "./props";

export default define_app({
  id: "recorder",
  name: "Recorder",
  icon: RecordIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Record your voice, your screen or your camera, and take photos.",
  keywords: [
    "voice",
    "microphone",
    "audio",
    "record",
    "screen",
    "screencast",
    "screen recording",
    "camera",
    "video",
    "photo",
    "webcam",
    "selfie",
  ],
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
