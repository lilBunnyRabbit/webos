import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { RECORDER_PROPS } from "./props";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "recorder",
  name: "Recorder",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Record your voice, your screen or your camera, and take photos.",
  pitch: {
    problem: "Recording a quick voice note or screen clip needs extra software.",
    solution: "Record your voice, screen or camera, and take photos, straight to your files.",
  },
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
