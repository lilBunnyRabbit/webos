import type { Attachment } from "svelte/attachments";

/**
 * MediaRecorder writes WebM without a duration, so the element reports `Infinity` and the controls show no length.
 * Seeking far past the end makes the browser find the real one; then it seeks back to the start.
 */
export const find_duration: Attachment<HTMLMediaElement> = (media) => {
  const settle = () => {
    if (!Number.isFinite(media.duration)) return;
    stop_probe();
    media.currentTime = 0;
  };
  const stop_probe = () => {
    media.removeEventListener("durationchange", settle);
    media.removeEventListener("timeupdate", settle);
  };
  const probe = () => {
    if (media.duration !== Infinity) return;
    media.addEventListener("durationchange", settle);
    media.addEventListener("timeupdate", settle);
    media.currentTime = Number.MAX_SAFE_INTEGER;
  };

  media.addEventListener("loadedmetadata", probe);
  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) probe();
  return () => {
    media.removeEventListener("loadedmetadata", probe);
    stop_probe();
  };
};
