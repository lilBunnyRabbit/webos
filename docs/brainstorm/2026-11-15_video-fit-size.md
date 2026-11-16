# Video Tools: fit a clip to a file size
**Date:** 2026-11-15
**Participants:** owner, Claude

## Context
Owner: "for video editing do we have the option to set 'this video can be max 20mb' and it will optimize it?"

Today Clip has Format (WebM/MP4), Size (Original/1080p/720p/480p, `kit/utils/video/plan.ts` `scaled_size`) and Quality (Low/Medium/High, `video_bitrate` = w × h × 30 × 0.04/0.08/0.16 bpp, 250 kb/s floor). Audio is fixed at 128 kb/s (Opus `kit/utils/video/encode.ts:13`, AAC `kit/utils/video/mp4.ts:5`). Both encoders use `latencyMode: "realtime"` with no `bitrateMode`, so bitrate is a soft target. Output size can't be predicted. Earlier sessions: [edits](2026-10-27_video-tools-edits.md), [MP4 and size](2026-11-08_video-mp4-and-size.md).

## Decisions
- **UI: Quality gains a 4th option, Fit.** Picking it shows a Max size MB field and an estimate row (size, resolution, bitrate). One control owns the bitrate. Rejected: a separate switch (two controls fight over bitrate); an always-visible cap (hard to explain together with Quality).
- **Budget:** `video_bps = target_bytes × 8 × 0.95 / seconds − audio_bps`, seconds being the part's length. Skip pauses only shortens the output, so the full length is a safe upper bound.
- **Resolution: auto-drop.** The Size pick is a ceiling. Fit uses the largest of Size, 1080, 720, 480 (never above the pick) where bits per pixel at 30 fps ≥ Low's 0.04. The Output row says when the size was lowered to fit. Rejected: keep the size and warn (the default result for long clips looks blocky); refuse below the floor (unhelpful).
- **Overshoot: 5% margin plus `bitrateMode: "constant"`, Fit only.** If the file still ends up over the target, the saved panel and the toast say so ("came out 20.6 MB, over 20 MB"). The file is kept. Rejected: re-encode when over (doubles the time); margin only (VBR drifts on high-motion footage). Low/Medium/High stay as they are (CBR would grow existing clips).
- **Audio scales down:** 128 kb/s, or 64 kb/s when audio would take more than 15% of the budget. Both encoders' audio setup takes a bitrate.
- **Too long to fit:** when even 480p at the 250 kb/s floor can't fit, the estimate reads "Too long for 20 MB: trim to ~m:ss" and Save is disabled. The shell errors with the same text. Rejected: encode anyway (a known miss after a long encode).
- **Persistence:** settings.json v3 adds `max_mb` (default 20); v2 migrates. Quality is still not remembered; picking Fit prefills the last MB.
- **Shell:** `clip <path> --max-size 20mb` (accepts `20mb`, `500kb` or a plain number in MB). It runs the same Fit logic as the panel and errors when combined with an explicit `--quality`.
- **Mobile:** same panel; the MB field is a numeric input.

## Key takeaways
- The planning math (budget, size drop, audio share, too-long check) is pure and lives in `kit/utils/video/plan.ts` next to `video_bitrate`, unit-tested.

## Action items
- [x] Build: plan function, encoder `bitrateMode` + audio bitrate, Clip panel Fit, settings v3, shell `--max-size`, `docs/apps/video-tools.md`, changelog.

## Next session topics
- Re-encode once on overshoot, if the margin misses in practice.
- Fit for GIF (budget via frame rate/width).

## Revision (2026-11-15, build)
- **Video stops at High's bitrate.** Without a ceiling a 3-second part with a 20 MB target would get about 50 Mb/s and come out near 19 MB. Fit means "at most", so the video bitrate is capped at High's 0.16 bpp and the estimate can read below the target.
- **The shell flag is on `video trim`** (there is no `clip` command): `video trim <path> -m 20mb`. `--quality` lost its default so an explicit one can be told apart; neither flag still means Medium.
- **MB is decimal** (20 MB = 20,000,000 bytes), like Image Tools' fit: the smaller reading of a site's limit. The saved panel still shows the size through the binary `format_bytes`.
- **Measured overshoot** (headless Chromium, drawn 640 × 360 footage, constant bitrate): VP9 and H.264 within about 1% at 0.08 bpp and up; at 0.055 bpp H.264 came out about 1.6× over, VP9 within 4%. Near Low's 0.04 bpp the "came out over" note will show for H.264; a second pass (above) is the fix if it does in practice.

## Revision (2026-11-16, review)
- Owner kept the High cap.
- **MP4 floor raised to Medium's 0.08 bpp** (owner): H.264 Fit lowers the size sooner, and its too-long limit is the smallest size at 0.08 bpp. WebM stays at 0.04 down to 250 kb/s.
- The panel and the shell plan with the sound kept. When the part would fit silent, the too-long text says to turn the sound off (`--mute`) instead of only saying to trim.
- The Max size field shows the saved value again on blur after an invalid entry (0 or empty).
