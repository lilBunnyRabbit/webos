# Immersive windows: full screen without the bars
**Date:** 2026-11-08
**Participants:** owner, Claude

## Context
Owner, 11-08, on a phone in landscape in Lunar Lander: "I want to have an even fuller screen option. Here it takes so much space the top and bottom bar that i barely have any screen realastate. Think about how to solve this but for sure by removing both but still somehow can go back to not full or sth".

On a phone the app's own toolbar takes about 100 px and the mobile nav bar (back, home, apps) about 115 px. Nothing hides them today. Mobile windows are already fullscreen in the shell sense (ADR-016). Browser fullscreen is used only for wallpaper visuals (`compat/features.ts` `fullscreen`).

## Decisions
- **Where (owner): the OS.** The window handle gets an `immersive` state (an API change, ADR-101). While a window is immersive:
  - on mobile, the nav bar is hidden;
  - on desktop, the window is maximized with no title bar;
  - the app hides its own toolbar by reading the handle.

  The play2d kit's game frames wire it once, for Lunar Lander, Airfield, Harbour and Drive Hub. Rejected: kit-only browser fullscreen (no iPhone; dialogs and menus outside the board don't show), and Lunar Lander only.
- **Exit (owner):** a small floating pill (⤢) in the top-right corner.
- **Avoiding the pill (owner): like a notch.** The OS publishes the pill's box as CSS variables on the window (`--immersive-inset-top`, `--immersive-inset-right`). Kit HUDs and camera insets honour them. Rejected: merging the exit into the pause button, and a draggable pill.
- **Browser bars (owner):** entering immersive also requests browser fullscreen on the page where supported, so Android hides its status bar and address bar. iPhone gets the WebOS bars hidden only. Leaving browser fullscreen (Esc, the system back) leaves immersive.
- **Desktop too (owner):** the same toggle maximizes, hides the title bar and the app toolbar, and goes browser fullscreen. Esc exits.
- **Shell (owner):** `win immersive [on|off|toggle] [window]`, toggle and the focused window by default. F11 runs it as an OS shortcut in `shortcuts/defaults.ts`.
- **Ways in (owner):**
  - a ⤢ Full screen button in the play2d game toolbars;
  - a "Full screen" item in every window's menu (the title bar menu on desktop, a long press on the switcher card on mobile), so any app can go immersive.
- **Persistence:** not saved. Session restore brings windows back non-immersive. (Lead's call: a restored immersive window would also need a browser fullscreen gesture it can't have.)

## Action items
- [x] ADR-101; build: WindowHandle `immersive`, the mobile and desktop shells, the pill and insets, browser fullscreen, the `win immersive` command and F11, the window menu item, the kit game frames, docs (windows service, shell pages, design shell, app-api, kit docs), the compat entry already exists (`fullscreen`).

## Next session topics
- Auto-hide the pill after a few seconds of play?
