import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Camera as CameraIcon, Flashlight as FlashlightIcon, HourglassMedium as HourglassMediumIcon, Images as ImagesIcon } from "phosphor-svelte";

export default [
  { icon: CameraIcon, title: "Straight to the shutter", text: "Opens on the camera when there's nothing to look at; one tap from the gallery otherwise." },
  { icon: HourglassMediumIcon, title: "Erases itself", text: "Pick 1 hour, 24 hours, 3 days or a week; the photos go when the time is up." },
  { icon: FlashlightIcon, title: "Torch and zoom", text: "Torch, one-shot flash, pinch zoom and tap to focus, wherever the camera allows them." },
  { icon: ImagesIcon, title: "Keep one", text: "Save a photo to Pictures for good, or give its batch more time." },
] satisfies AppHighlight[];
