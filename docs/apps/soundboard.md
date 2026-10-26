# Soundboard
Id `soundboard` · Source: `src/lib/apps/user/soundboard/` · [brainstorm](../brainstorm/2026-10-20_soundboard-trim.md) (trim, pad images, pads from a video) · Kit: `$kit/utils/audio`, `$kit/components/waveform`, `$kit/utils/video` ([app API](../system/app-api.md#app-kit-kit))

## What it does

A grid of pads that play your own sounds by click or key, on one or more boards. A pad has a label, a theme colour or any colour, an optional picture, a volume, a key and a loop switch. Its sound can be trimmed and cut in the pad dialog, and a pad can be made from a part of a video: the video opens a trim sheet with the picture following the handles, and only the chosen part is kept, as a WAV. Sounds and videos come in through Add sounds…, a drop, or Ctrl+V (`paste_files`, every pasted file at once through the same `add_files` as a device drop). Credit: LaxDOTexe and the owner (`meta.ts`).

## How it works

### Playing

`player.svelte.ts`. One `SoundPlayer` per page, shared by every Soundboard window and the `sb` commands, so a sound started anywhere shows and stops everywhere. Its `AudioContext` is built on the first play (one made without a user gesture starts suspended); `unlock()` gives `resume()` a 1 s deadline for callers outside a click, like the shell. Each press decodes the pad's file with `decodeAudioData` and keeps the 24 most recently played `AudioBuffer`s (decoded PCM is about 10 MB a minute of stereo). A voice is a buffer source through the pad's gain into a master gain (the window's volume).

`play_action(mode, loop, playing)` (`board.ts:170`) decides what a press does: not playing starts; a loop pad that's playing stops; otherwise Restart mode stops the old voice and starts again, Overlap adds a voice. With no window holding the player, it closes once the last sound ends; closing the last window stops every sound.

### Edited time and source time

`timeline.ts`, pure, Node-tested. The editor keeps the sound as `Pcm` (`$kit/utils/audio`) plus the list of source segments still in it. Deleting a selection runs `cut_regions`, which joins the kept parts with a 10 ms linear crossfade, so the result is shorter than the sum of its parts by 10 ms per seam. `remove_span` (`timeline.ts:31`) applies the same cut to the segment list in edited time, and `offsets` (`timeline.ts:7`) places each segment with every seam after the first overlapping by the crossfade, so the two stay in step. `source_time` (`timeline.ts:21`) maps a moment of the edited sound back to the video it came from: find the segment whose start is at or before it, add the distance, clamp to the segment.

That mapping is what lets the trim sheet show the right frame. `moved_mark` (`timeline.ts:53`) says which mark the user just moved (a trim handle or a selection edge), and the muted `<video>` above the waveform seeks to `source_time` of it. While the sound plays, the picture follows the playhead and jumps at each cut (it seeks when it's more than 0.25 s off) instead of drifting past it (`sound-editor.svelte`).

### Reading a video's sound

`soundboard.app.svelte:146` (`add_video`), `clip-dialog.svelte`, `record.ts`.

1. `probe_tracks` (`kit/utils/video/capture`) reads duration, picture and sound from the element's `captureStream()` tracks before anything is decoded. No picture (an audio-only WebM or MP4): added like any sound. No sound Chrome plays: a warning, no sheet.
2. Length. Decoding holds the whole sound as 32-bit float twice, the decoded copy and the edit: `decode_bytes` (`board.ts:81`) estimates seconds × 48 kHz × 2 channels × 4 bytes × 2, about 46 MB a minute. Over 10 minutes (`LONG_VIDEO_SECONDS`) the user confirms with that estimate; over an hour (`MAX_VIDEO_SECONDS`) it refuses and points at Video Tools' audio export.
3. `decodeAudioData` on the whole file first: Chrome reads AAC and Opus out of MP4, MOV, MKV and WebM this way.
4. When that fails, `record_audio` (`kit/utils/video/capture`) plays the file muted once and records its sound track with `MediaRecorder` to Opus WebM, in real time, as a TasksService job with progress (time read of the total) and Cancel. The recording is then decoded like any sound. Closing the sheet cancels the job.

The sheet ("New pad from a video") opens straight into the trim editor. Add pad renders the kept part and writes `{video name}.wav` into the sounds folder (a free name); the video isn't copied or touched.

### Trim editor

`editor.svelte.ts` (`SoundEditor`), `sound-editor.svelte`, shared by the trim sheet and the pad dialog's "Edit audio" section. The `Waveform` (`$kit/components/waveform`) draws peaks scaled to the loudest one, so a quiet phone recording still shows its shape, with start and end handles and a drag-to-select span. Play plays the selection, else the trimmed part, from a fresh buffer built with `cut_regions`. Delete selection cuts the middle; a trim end after the cut moves back by what the cut really removed, the seam's 10 ms crossfade included, so the kept part ends on the same sound. Keep selection is its inverse: `keep_span` (`timeline.ts`) moves the trim handles to the selection edges and clears it, so nothing is cut and edited time, the segments and the video mapping stay as they are (a Node test checks the mapping after an earlier cut). Undo edits goes back to the loaded sound, undoing either. Layout, the same on a phone and a desktop: the Waveform (zoom tray and help above the wave, nudges and length below it), then one action bar of four equal secondary buttons, Play (Stop while playing), Keep, Delete, Undo, short labels with the full action as accessible name and tooltip; Keep and Delete stay in place, disabled, without a selection so the bar never changes shape. The pad dialog's Save audio sits under the bar. Both dialogs keep their footer (Cancel and the primary action) stuck to the bottom of the scrolling sheet, with scroll padding so a scrolled-to editor isn't hidden under it. Buttons are 44px tall on a coarse pointer. The waveform zooms and scrolls (buttons, Ctrl/⌘+wheel, pinch) with a time ruler; while a sound plays it turns the page to keep the playhead in view. Markers are thin lines on the wave, grabbed by tabs outside it (trim below, selection in the ruler), dragged relatively, with ◀ ▶ nudges and a millisecond readout for the last one grabbed (the trim start until then); on touch, zoomed in, the wave scrolls and touch-and-hold or the ruler selects. The video picture follows whichever marker moved (`moved_mark`), nudges included. Kit details in [components](../design/components.md). `render()` cuts to the handles and encodes.

In the pad dialog, opening Edit audio scrolls the editor into view; Save audio writes `{name} (edited).wav` (a free name) next to the pad's copy and points the draft at it; the original copy stays. Edits saved but not kept (Cancel, or saved twice) are deleted when the dialog closes.

### WAV encoding

`$kit/utils/audio/wav.ts`: `encode_wav` writes a 44-byte RIFF header and 16-bit PCM, channels interleaved, at the decoded sound's sample rate (the `AudioContext`'s). A WAV plays the same everywhere and needs no encoder; the cost is size (about 11 MB a minute of 48 kHz stereo).

### Colour and picture

A pad's `color` is a theme token name (`primary`, `secondary`, `tertiary`, `accent`, `info`, `success`, `warning`) or any `#rrggbb`. Any colour is an owner-approved exception to "theme tokens only", as user content. Both kinds set one `--pad` custom property (`pad_tone`, `colors.ts`), so token and hex tiles share the same tint classes. `image` is a path to a picture anywhere in the file system, read on render and shown as the tile background; a missing file falls back to the colour.

## Data

| What | Where | Format |
|------|-------|--------|
| Boards | `/var/lib/apps/soundboard/board.json` (`storage.file`) | `{ version: 1, boards: [{ id, name, pads }] }`, at least one board, zod-checked (`BoardFileSchema`, `board.ts:48`) |
| Pad | inside a board | `{ id, label, sound, color, volume (0–1), key, loop, image }`: `sound` a file name in the sounds folder; `key` one of `1`–`9`, `a`–`z` or `null`, unique on its board; `image` a path or `null` (optional on read, added without a version bump) |
| Sounds | `/var/lib/apps/soundboard/sounds/` | The board's own copy of every added file, and the WAVs made by trims and videos. A sound is deleted when no pad on any board uses it any more |
| Volume, play mode | `app.soundboard.volume`, `app.soundboard.mode` | Number 0–1 (default 0.8); `restart` or `overlap` |
| Per window | `board`, `imported` | The open board; whether the `path` prop was already added, so a restored window doesn't add it again |

Props: `{ path }` (`FILE_PROPS`). Soundboard is a tool for `audio/*` and `video/*`: Open with on a sound adds a pad, on a video opens the trim sheet.

Shell (`commands.ts`, `shell.ts`): `sb` opens it; `sb ls [-b board]`, `sb play <pad>` (label, key or id; a loop pad that's playing stops), `sb stop`, `sb add <paths…> [-b board]`. `sb add` refuses a video ("open it in Soundboard to pick the part"), since picking the part needs the sheet.

## Dependencies & licences

None of its own. It uses the app kit (`$kit/utils/audio`, `$kit/components/waveform`, `$kit/utils/video`) and Video Tools' `kinds.ts` for which names and types count as video.

## Limits

- A whole video's sound is decoded into memory; the 10 minute confirm and 1 hour refusal are the guard, and the memory estimate assumes 48 kHz stereo.
- The record fallback takes as long as the video and needs the tab to keep playing it.
- When a pad moves to an edited sound, its original copy stays in the sounds folder with no pad using it (an open question in the brainstorm).
- Decode and encode times and WAV sizes on real files are unmeasured.
- Pad images are references: moving or deleting the picture drops it from the tile.

## Decisions

- [Soundboard: cut and splice](../brainstorm/2026-10-20_soundboard-trim.md): write a new WAV rather than regions on the pad, trim plus cutting the middle, the kit placement, pad images, the free colour picker; the follow-up for pads from a video (decode first, record as fallback, memory limits, the picture following the handles).
