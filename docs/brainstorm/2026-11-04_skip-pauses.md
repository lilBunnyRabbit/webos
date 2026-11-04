# Skip pauses
**Date:** 2026-11-04
**Participants:** owner, Claude

## Context
lax: "When you timelapse/screen record, having a "remove identical frames" feature would be dope cause when you watch it back it includes all the pauses you made, but with this feature it would be none stop action! lmao like every frame that looks identical will be removed and allows for seemless even-playback"

What exists: Recorder records the screen with `MediaRecorder` (`recorder/session.svelte.ts`), so it never sees single frames. Video Tools already rebuilds a video frame by frame: kit `capture()` plays the file and hands each frame over (`$kit/utils/video/capture.ts:76`), kit `WebmEncoder.encode_frame(source, timestamp)` takes any timestamp (`$kit/utils/video/encode.ts:200`), and the GIF path writes its own frame delays (`video-tools/jobs.ts:154`). So skipping a pause is: drop frames that look like the last kept one, and stamp the kept ones on a running output clock. No new dependency, no new format. Motion Watch's detector (`motion-watch/detect.ts`) is built for camera noise and blobs; too heavy for this.

## Decisions
- **Home: both apps.** Video Tools gets a **Skip pauses** toggle for any video; Recorder gets a way into it for its video takes. Rejected: Recorder skipping live while recording (needs a WebCodecs recording pipeline instead of MediaRecorder; only new recordings).
- **Recorder link: launch Video Tools with a prop.** Recorder's review of a screen or camera video take gets **Save & remove pauses…**: it saves the take as usual, then `apps.launch("video-tools", { path, skip_pauses: true })`. Video Tools' props become `{ path?, skip_pauses?: boolean }`; `skip_pauses` opens with Clip and Skip pauses preset; the user presses Save. Rejected: moving `export_clip` into the kit so Recorder runs it on the take (large refactor for a second user, Recorder grows a slider); kit filter only with a second export loop in Recorder (two loops drift).
- **Outputs: Clip and GIF.** A skipped frame isn't encoded (WebM) or written (GIF). The GIF frame-count and size estimate becomes an upper bound while Skip pauses is on.
- **Detection: against the last kept frame, with a sensitivity slider.** Each frame shrunk to about 160 px wide grey; count pixels that differ from the last kept frame by more than a small step; under the sensitivity's share, skip. Comparing with the last kept frame (not the previous one) keeps slow drift (fades, slow scroll) once it adds up. Rejected: vs previous frame (a slow fade disappears entirely), a fixed threshold (no recourse for a blinking cursor or faint strokes).
- **Sensitivity:** default tuned by the builder on test footage so a blinking cursor or ticking clock counts as still; remembered in `/var/lib/apps/video-tools/settings.json` through `storage.file` (`{ "version": 1, "skip_sensitivity": … }`).
- **Pause hold: cut fully.** The frame that starts a still stretch stays for one normal frame time; the rest of the stretch is gone. Rejected: a short held beat per pause (less non-stop).
- **Sound: dropped.** While Skip pauses is on, the Sound toggle is off and disabled with a note that skipping pauses removes the sound. Rejected: cutting the audio with the frames (clicks at each cut, crossfades), skipping only silent pauses (an audio pass and more rules).
- **Shell: nothing.** `video trim` and `video gif` stay as they are.
- **Mobile:** Video Tools already runs on both; the toggle and slider follow its panel. Recorder's screen source isn't on phones, but a camera video take gets the button.
- **Credit:** idea from lax (ROADMAP line).

## Key takeaways
The whole feature sits on the existing frame-by-frame export: a frame filter plus a running output clock. The one structural change is a new optional prop on Video Tools.

## Action items
- [x] ADR-092, build in one worktree agent: Video Tools Skip pauses (Clip + GIF), settings file, `skip_pauses` prop, Recorder button, `docs/apps/video-tools.md` (now has an algorithm).

## Next session topics
- Keep narration: skip only pauses that are still and silent.
- Skipping live while recording (WebCodecs recording in Recorder).
