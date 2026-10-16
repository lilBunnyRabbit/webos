# Theme generator

**Date:** 2026-10-16 · **Participants:** owner, Claude

## Context

Random themes shipped in 1.11.0 as a Shuffle button and `theme random` ([earlier log](2026-10-16_quick-launch-and-random-theme.md)). The owner read Shuffle as "just shuffle" and asked for "a full new colors generation". Shuffle already made new colours, but with no controls, no preview, nothing kept and muted fixed ranges (chroma ≤ 0.15). So it read like picking from a list.

## Decisions

| Question | Decision | Rejected |
|---|---|---|
| Shape | **Generate panel in Settings › Appearance**: Mode (Dark, Light, Any), Harmony, Vibrance and Contrast sliders, five swatches with a lock each, a live preview, Generate and Apply | Its own Theme Studio app (overlaps Appearance); same button with a wider range (still no control) |
| Keeping results | **Last 8 generations, session only**, in the Settings app's module state (`generator.svelte.ts`). They survive closing Settings, not a reload | Named custom themes in `/etc/settings.json` (schema change); panel component state (lost on close); nothing |
| How wild | **Readable always, wide range**: the 0.55 text and 0.35 colour lightness gaps stay, but chroma reaches vivid (up to 0.3), backgrounds can be tinted, and mode can be Any | Fully random with an "unreadable" warning |
| Shuffle | **Removed**; the panel replaces it. `theme random` uses the generator's defaults (current mode, any harmony, medium vibrance and contrast) | Keeping both |
| Shell | **`theme random` only**, no new commands | `theme generate` with flags, `theme save` |

## Key takeaways

- One pure generator, `generate_theme(options, rand?)`, replaces `random_theme`. Locks are inputs: locked colours keep their value, and the generated ones are placed around them so the gaps still hold.
- No persistence change: Apply writes an ordinary customised `settings.theme`, as Shuffle did.

## Saved themes

The owner tried the generator and wanted to keep results: "Keep like 3 recent and a way to save them."

| Question | Decision | Rejected |
|---|---|---|
| Recent | **3**, still session only | 8 |
| Storage | **`saved_themes` in `/etc/settings.json`**, travels in backups | Own `/etc/themes.json` |
| Save UI | **Save… asks a name**; a **"Your themes" grid** above the presets with right-click Apply, Rename…, Delete… | One-click save with auto names |
| Shell | **`theme list` / `theme set` / completer include saved; `theme save <name>`, `theme delete <name>`** | List and set only; nothing |

Not asked, decided in building: names are unique (case ignored) and can't be a preset's; the UI blocks a taken name, while `theme save` replaces it. About › Reset settings keeps saved themes, like files.

## Notes from building

- ~~A locked colour from the other mode stays as given, so the gap can break.~~ Fixed in 1.14.1: when the locks only fit the other mode, the mode flips (a locked background already did this). Locks that fit neither mode (text at L 0.5) keep the asked mode and may break the gap.

## Action items

- [x] `generate_theme` with tests, `theme random` on it
- [x] Generate panel in Appearance, Shuffle removed, recent row
- [x] ADR-015 revision, settings and system-apps docs, changelog
