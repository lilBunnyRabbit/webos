# Portfolio

Id `portfolio` · Source: `src/lib/apps/user/portfolio/` · [Portfolio brainstorm](../brainstorm/2026-10-22_portfolio-app.md), [ADR-047](../adrs/047-solo-app-open.md)

## What it does

The owner's portfolio, as an app: a terminal rail on the left types a short tour, and five windows tile in beside it as it goes. Who I am, Work, Projects, How I build, then Contact. A visitor can take over at any point by typing, searching with `/` or clicking. `https://lilbunnyrabbit.github.io/portfolio` redirects to the solo link `#/solo/portfolio`, so a visitor lands on it without the intro or Restore.

The layout was picked from the Portfolio Lab's concept rounds ("split A: Terminal rail"); the lab and every other concept app are gone (see the brainstorm).

## Layout

```
portfolio/
  portfolio.app.svelte   the desk: rail or stacked mode, the stage, the morph, Contact's dialog, keyboard routing
  desk/                  the session, the tour script, the windows and their pure helpers (Node-tested)
  particles/             the WebGL2 particle engine behind Who I am's and Contact's logo
  content/               every word a visitor reads, as typed records
  commands.ts            whoami and portfolio [section]
  contrast.ts, links.ts, draft-mark.svelte, social-icon.ts
```

## How it works

### Content as records

Every word comes from `content/*.ts`, typed in `content/types.ts`; components only lay it out. Each block carries `status`:

| Status | Meaning | Shown |
|--------|---------|-------|
| `ok` | Approved copy (cv repo: CV v24, LinkedIn) | Always |
| `draft` | Built from sourced facts, waiting for the owner's sign-off | Always; dev builds add a `Draft` badge (`draft-mark.svelte`) so drafts are reviewed in place |

The cv repo's GATED and NEVER material never enters these files. `content.test.ts` guards the rest: phrases from the never-publish list (phone, company growth figures, PostHog, `pdf-to-book`, TesterArmy, buzzwords, people-management verbs) in the content and in the app's own copy (`desk/`, `particles/`, the root `.ts` and `.svelte` files), Cosylab limited to the LinkedIn sentence, every `status` valid, every external link `https`, every Open in WebOS target an app that ships with WebOS, every cited ADR file present, every engagement's sentence found, every `shows` key a real principle.

### The session (`desk/session.svelte.ts`)

`PortfolioSession`, one per window, owns everything the desk shows: the terminal `log` and `history`, the tour state, which windows are `open` and their stacking `order`, drag offsets (`moved`), the lit principle, the focused `job` and `project`, Contact's draft (`subject`, `message`, kept across close and reopen) and per-window `pulses`. Every way in goes through it: a typed line (`submit` → `parse` in `desk/script.ts` → `run`), a search hit (`jump`), a click on a principle (`light`), a window's close button (`dismiss`). Nothing persists: a new window, a reload or a restore starts the tour again.

Terminal commands (`HELP` in `script.ts`): `whoami`, `how [--i-build | principle]`, `work [--timeline | job]`, `projects [id]`, `contact`, `mail "subject"` (opens Contact with the subject filled), `tour`, `tidy`, `close <window | all>`, `ls`, `clear`, `help`; aliases `principles`, `timeline`, `experience`, `replay`, `email`, `?`. `tidy`, `close` and `ls` are desktop only. A word that isn't a command is searched (`search.ts`) and answered like `/word`; a near miss gets "Did you mean". As the visitor types, `suggest(line, stacked)` lists what the word can become (commands with their `HELP` line, then the typed command's arguments with the principle, job, project or window they name; at most `SUGGEST_MAX`, desktop-only commands left out when stacked) under the prompt, and the picked one's remainder shows as faint text after the caret. ↑↓ move the pick, Tab or → at the end of the line takes it, a click takes it; Enter runs the line as typed. Browsing history (↑ on an empty list) hides them. These live inside the app's own terminal, not the WebOS shell.

### The tour

`TOUR` in `script.ts`: `whoami`, `work --timeline`, `projects`, `how --i-build`, `contact`. The first step appears at once (the first screen is the one most visitors judge it by); each later one is typed out (46–88 ms a key, 38 on a phone), runs, and holds. Projects holds until its graphics have played (`PROJECTS_PLAY_MS` from `project-timing.ts`; on a phone the card carousel's length), and `how` lights `TOUR_PRINCIPLES` (decisions, team, feel) one beat each (3.4 s, 3.2 s on a phone) before Contact.

Taking over:

- **Typing, a search, a command:** `pause(true)` stops the tour and opens every remaining window at once, composed, so nothing is left behind a resume; the terminal's control then offers Replay. Its Skip does the same. On the desktop both leave Contact shut (`open_rest`), the way a `?section=` link does: it would float its scrim over the prompt the visitor is typing into. Contact still opens when the tour reaches it, from `contact` / `mail`, the Email buttons and `?section=contact`.
- **A click on the terminal:** on the desktop it only readies the prompt (the caret shows, the tour plays on) and the first key takes over; in the stacked layout the click or tap takes over at once.
- **Dragging a window, a click in How I build or Who I am's footer:** `pause()` only stops it; Resume continues from the next step that still has something to do (`next_step` skips windows the visitor opened).
- **On a phone** every take-over opens the rest, Contact included (it's a window in the column there), since its tour scrolls one long page.
- **Reduced motion:** the tour doesn't play; `finish()` opens the rest quietly, the same set a take-over opens, so the desktop lands without Contact floating over it.
- `tour` / Replay closes everything and plays from the start.

### Layout and compose (`desk/layout.ts`)

`fits_rail(width, height)`: the rail (`rail_width`, 22% of the width clamped to 264–360 px) and three columns (`COLUMN_MIN` 288 + 296 + 300, with gaps and padding) fit side by side and the height is at least 600 px. That's about 1250 px wide; a 1280×640 browser viewport is 596 px tall under the solo bar, so it stacks. Otherwise the app is **stacked**: the terminal sits on top, the windows form one scrolling column, and Contact is a window in it.

`compose(width, height, open)` gives every open window a fixed slot, so opening one never moves the others, except the opening hero:

- Who I am alone is the hero, centred (at most 760 × 540).
- Once another window opens: Who I am takes the first column (30% of the room, 288–380 px), with How I build under it when both are open (Who I am gets half, at least 320 px; How I build at least 290, so every principle title stays in view). Work takes the second column (33%, up to 460 px), Projects the rest. The desk is capped at 1640 px and centred.
- Contact has no tile: on the desktop it floats as a dialog centred over the whole app, with a scrim; Escape or the scrim closes it and focus goes back where it was.

A dragged window keeps its offset (`session.moved`, clamped so its title bar stays on the stage); `tidy` clears them. Re-tiles run through an element-scoped View Transition on the stage (`morph` in `portfolio.app.svelte`): frames resize while the pictures inside never scale, a window whose width changes cross-fades its reflow, a new window waits 320 ms only when the others actually move. Re-tiles take 460 ms on `--portfolio-move` (a gentler curve than `--ease-out`, whose fast start read as a jump), reflow fades 260 ms, a new window rises over 420 ms. Tiled windows' shadows live in a `.shades` layer under the stage, outside the transition's scope: one live element per tiled window at its slot box, sliding with CSS transitions at the morph's timing (460 ms, `--portfolio-move`); a new one fades in with its window's entrance (the same `--enter` delay), a leaving one fades out with it. A transition frame draws the same 1px edge the window has: the focused window carries the `portfolio-focused` view-transition class for the brighter edge, and the window's ring has no transition, so nothing fades in when the morph hands back to the live window. Snapshots never carry a shadow, so none is rasterized mid-animation (the stepped banding) or swapped at the end, and none falls across a gap onto a neighbour. A window dragged (`session.held`) or left out of its slot (`session.moved`) casts its own shadow on itself, so it can shade what it lies over. A closing window is unnamed first, since a named element that leaves aborts an element-scoped transition in Chrome.

### Evidence and `shows` (`desk/evidence.ts`)

A principle (`content/principles.ts`) is proven by jobs and projects:

- A job proves it when the principle's `proof` text names the company, or a case-study block mapped in `WORK_PROOF` (draft mapping) shows it.
- A project proves it when the proof names the project, or the project's own `shows[principle]` says how.

Each job and project labels at most `SHOWN_MAX` (3) principles as chips, the tour's three first. Lighting a principle (the tour, `how <id>`, a click) glows only the cards and jobs that label it (`SHOWN`), raises their windows and scrolls each one card into its window's body (`bring_into`, never the page). A principle no card labels still points somewhere: the place its proof names is brought in and pulsed. `proof_for` cuts a principle's proof into the part about one job or project (a sentence naming a target starts its part, the unnamed ones after it carry on), and `how_for` prefers the job's own case-study block. Who I am's logo previews the principle's glyph on hover or focus (`peek`) and takes it when lit.

### Work

`timeline-window.svelte` renders `work-axis.svelte`: a time axis, newest first. Astra sits on top, 2026 at its node down to 2025, then While True 2024 down to 2019. Each job owns its years (`axis_years` in `work-units.ts`: a calendar year goes to the job with most months in it, reversed for display only) as a span bar with year ticks; each block sits against its newest year and its span runs down through the older ones. In a tall window spare height is shared by years (`flex-grow: var(--weight)`) and each job's units spread over its stretch (`space-between`), so no span reads as empty years. Per-job scale, never overlapping.

Both jobs get the same shape (`WORK_UNITS` in `work-units.ts`, tested): a header with the company (a link when the job has `url`, `site_of`) and full years ("2019–2025"), one line (the summary's first clause; While True's carries the Junior to Senior path), then units of work as a name plus one line: Astra's case studies (each with the first clause of the highlight that matches it best, `overlap` in `work-more.ts`), While True's engagements ("At X, I" cut off). Units run newest first (`newest_first`: by start year, a longer run first on a tie, undated ones on top since the CV puts them later), each showing its own years; a job whose units carry years drops the even year ticks and marks each unit's start year beside it instead (once per year), so 2020 sits beside RPI Print and 2019 beside Blurb. No More, nothing behind a toggle; highlights no unit matches aren't shown.

An engagement's sentence (`engagement_line` in `content/experience.ts`) is the job summary paragraph that names the client, never a copy, so each claim is written once (the test checks every engagement finds its own, distinct sentence). The window keeps `lit_job`, `flashed` and `mark` for lighting and `work <id>`; the axis only draws.

### Projects

Six featured cards (WebOS plus `FEATURED`) in a bento grid (2 columns from a 30rem window, WebOS and the fourth card across; 3 from 40rem), each with a small scripted graphic (`graphic-*.svelte`: WebOS: two plain windows open from the taskbar and snap to halves; Chromatics: a script line resolves into a palette that tints a small card; Task Manager lanes, Petrace tracing, Series Tracker seasons, AGTC). The art uses the theme's primary, secondary, tertiary and accent, never the status colours. `GraphicPlayer` (`project-player.svelte.ts`) runs each on rAF from a timeline in `project-scenes.ts`, plays when the card comes into view, staggered 250 ms, and pauses while hidden. The whole graphic is its replay button (`project-replay.svelte`): a "Replay" hint on hover or focus, and on touch for a moment after a play ends. On a phone the cards are a carousel. A card reads name, kicker (in primary, always under the name), tagline, then the note behind an info icon; the stack isn't shown (it stays in the content for search). Its links sit on the card's bottom edge (the last grid row is `1fr`), so cards side by side line up, with the kind badge at the row's right end, as on the small tiles.

Below them, In progress (`IN_PROGRESS`, dashed cards with a "Now:" line), then "Smaller things" (`MORE`, `ALSO`) as tiles, each with a small drawing for a cover (`small-art.svelte`), its name, line and links. Packages get one tile each (optional: a value beside an empty slot that reads null; event-emitter: one dot wired to three listeners; utils: a grid of helper chips; service-observer: a watcher orbiting a service box). Work Hours draws a week of day bars, quno a short todo list with one note handed on (↵), the Polymorphic component gist a `<Box as="a">` with its props. Every small tile carries its kind (`badge` in the content: Web, CLI, npm…) in the footer beside its links, never over the drawing. The count in the header and the `projects` line counts tiles (`tile_count`), so the packages count four. The header's "N smaller" jumps there, and `projects packages` scrolls to the packages. Each card's Shows chips (`principle-marks.svelte`) carry the principle's title as their name; a lit principle only lights its chip (no title beside the row), and a pressed chip unfolds its sentence about that project under the row (a `grid-template-rows` 0fr→1fr transition that keeps the last story in place while it folds away, so the card and the one beside it grow and shrink instead of jumping). On touch the row says "Shows N principles".

### How I build

`how-slides.svelte`: one slide per principle: "04/06", title, a primary rule, the line, the proof under a left rule, revealed in a stagger (no links to the places the proof names: lighting the principle already glows and brings in those cards and jobs), with the principle's glyph as a watermark in the top corner (the number and title stop short of it, `--mark`). Under it a bar: the progress ring button (runs `how` to play all, or pins the current one; its arc fills over the beat) and six number tabs "01"–"06", one fixed height and tinted when shown. Arrows step and light, a swipe on the slide turns it. All of it goes through `HowShown` (`how-shown.svelte.ts`): the principle shown is `lit ?? last lit`, so hover never turns the page; `peek()` previews the glyph in Who I am's logo after 280 ms (`PEEK_DELAY`) of the pointer resting on a tab, at once on keyboard focus, never on touch (`how-shown.svelte.browser.test.ts`). Navigation (`move_of`, `step_index`, `swipe_of`) is in `how-nav.ts`, tested.

### Backdrop

`desk/backdrop.svelte`, mounted first in `.portfolio`, is a neutral radial ramp down the background shade ladder, never a brand colour: lit in the middle of the stage (it takes grid column 2, so it centres beside the rail), darkest at the edges. Dark runs to `background-darkest`; light stops at `background-dark`, because light's deeper shades turn loud. Stacked, the ellipse is wider and sits higher. The layer is fixed, so on a phone the page slides over it.

### The particle engine (`particles/`)

Who I am shows the name, the role, two facts as tags (years of experience from the approved bio via `experience_line`, and `PROFILE.location`) and the positioning line; no skills list, the projects' stacks say that.

Who I am's logo and Contact's mark are a WebGL2 particle swarm. `ParticleStage` (`stage.svelte.ts`) samples a shape (`shapes.ts`: the logo from `logo-mark.svelte?raw`, or a principle's glyph from `glyphs.ts`) into a mask, places targets evenly over it (`even-targets.ts`: a jittered grid thinned to the count, ordered left to right so a morph sweeps), and hands them to `ParticleField` (`field.ts`), which integrates a spring toward the targets on the GPU with transform feedback (`shaders.ts`) and draws the dots in `primary`. The pointer parts them. A few probe particles run the same spring on the CPU, so the page knows when the figure has landed without reading the GPU back. Setup is split across frames and links asynchronously where the driver allows, so the first screen never stalls. Colours are read through `desk/measure.ts` (a probe element and a 1×1 canvas) and re-read on theme change. Without WebGL2, or while a lost context hasn't come back, the static logo shows. Reduced motion places the dots at once. The figure's box and the host canvas's `--fx/--fy/--fw/--fh` are measured in the canvas's own CSS px with any ancestor transform divided out (`particles/local-box.ts`): a window that opens with a scale (Contact) would otherwise leave the swarm and its mask small and off-centre, since ResizeObserver doesn't fire when a transform ends. The mask keeps the whole logo at full strength (black to 80% of a 0.66× figure ellipse) and fades to 22% beyond it.

### Contact

Contact is a compose window. The left pane holds the particle logo, the name and role, the owner's local time (`clock` in `contact.ts`, Europe/Ljubljana, ticking each minute, "in Ig") and the LinkedIn, GitHub and X links with their names, in one row (pinned to the pane's bottom in the wide layout). The right pane holds the To row (a copy button; "Copied" shows only once the copy succeeded, a failure is a toast), the subject and the message. Its footer bar is where availability (`PROFILE.availability`) lives; Who I am's footer holds the social icons only. The subject fills the window title ("New message: …").

Send, or Mod+Enter, opens the visitor's mail app through `mailto(address, draft)`: subject and body percent-encoded, line breaks as CRLF (RFC 6068), empty fields left out so a blank draft is just the address. Nothing is sent by WebOS itself. On the desktop Contact floats centred over the whole app with a scrim; Escape, the scrim and X close it, and focus goes back where it was. In the stacked layout it's the last window in the column.

### The terminal

The split rail is the only terminal (`terminal.svelte`, `terminal-live.svelte`, `terminal-steps.svelte`, `terminal-now.ts`).

- **Desktop rail:** the title bar (Email, LinkedIn, GitHub, X); the live area, which shows the tour's step ("Step 2 of 5", a segmented bar filling over each hold: `session.hold_for`, falling back to `TOUR[i].hold`), the command being typed and what it opened, and after the tour "Your turn" with a Try list or the last command's outcome (`now_of`, `outcome_of`, tested), its lines starting a fixed 28% down instead of centred; the scrollback, a fixed 45% of the rail from the first command on, filled from the bottom, so neither a new log line nor a taller step moves the live area; the prompt; a status row with skip / resume / replay, tidy and search. The tour's typing shows in the live area, so the prompt stays the visitor's own line.
- **Stacked:** the title row, the prompt row (Email in short windows, the tour control, Search) and the step rail, whose labelled steps run their command, so it doubles as section navigation. A typed command's answer opens as a sheet anchored under the terminal, as wide as it (`popover`), unless the command moved the page.
- **Click anywhere** on the terminal focuses the prompt, except on links, buttons, search options, the sheet, the scrim and a click that ends a text selection.
- **The caret** is the native block caret with `caret-animation: manual`, blinking through CSS on `:focus`; a keypress restarts the blink, and it's steady under reduced motion. Unfocused, a hollow block and an invitation ("Click or type to take over", "help, or / to search") stand in for a placeholder. Focus tints the prompt row with a primary left bar and lights the rail's edge.

### Keyboard

A printable key anywhere in the window focuses the terminal's prompt with that key; `/` opens search; Escape during the tour focuses the prompt, and closes Contact when it floats. Modifier shortcuts and other keys pause the tour. A keydown that lands on the page's body while the window is focused still reaches the prompt.

## Props and shell

- Props: `{ section?: "who" | "work" | "projects" | "how" | "contact" }` (`PORTFOLIO_PROPS`, `index.ts`). With a section the app skips the tour the way taking over does (`start_at`) and brings that window forward; on the desktop every window but Contact opens, unless Contact is the one asked for, which then floats over the tiled desk and takes focus. On a phone every window opens and the page scrolls to the section. `#/solo/portfolio?section=work` and `#/app/portfolio?section=contact` work as links.
- The window opens maximized (`defaults.flags`): the rail layout needs about 1250 px, and the default 62% share would open the stacked layout on most screens. Un-maximized or resized below that, it stacks.

`commands.ts`:

| Command | What it does |
|---------|--------------|
| `whoami` | One `profile` value (name, role, email, github, linkedin); clicking it opens Portfolio. Loads `content/profile.ts` only when run |
| `portfolio [section]` | Opens Portfolio at that section, or, when a Portfolio window is already open, unminimizes and focuses it. The section isn't passed to an open window: that would need a props-update API on the window handle. Sections complete from the enum |

Like every app command they refuse to run while Portfolio isn't installed (ADR-040).

## Links that work in both modes

`desk/project-links.svelte` renders `Link` records: the first written out, up to two more as icons. Live, Source, npm, Docs and Website are plain links to a new tab. Open in WebOS is shown only when `apps.get(app)` exists, then: full mode `apps.launch(app, props)`; solo mode (`kernel.mode`) a link to `#/app/{id}?{props}` in a new tab (`app_href`, `links.ts`), since `SoloAppsService.launch()` only points to Open WebOS.

## Data

- Props only; no files, no storage keys. The session lives in memory per window.
- Counts that move (apps) come from the registry.

## Maintenance

| To change | Edit |
|-----------|------|
| Job-search line | `PROFILE.availability` in `content/profile.ts` (set `status` to `ok` once approved) |
| A job or client engagement | `content/experience.ts`; an engagement's sentence lives in the job's summary |
| A case study | `content/work.ts` |
| Add a project | `FEATURED`, `MORE`, `ALSO` or `IN_PROGRESS` in `content/projects.ts`; `shows` ties it to principles |
| A principle | `content/principles.ts`; its glyph in `particles/glyphs.ts` |
| The tour | `TOUR` and `TOUR_PRINCIPLES` in `desk/script.ts` / `desk/evidence.ts` |
| A featured project's graphic | `desk/graphic-*.svelte`, its timeline in `desk/project-scenes.ts`, its length in `desk/project-timing.ts` |
| Window sizes | `desk/layout.ts` (the test covers 1440, 1280, 1366 and 1920 px desks) |

Approving a draft is changing its `status` to `ok`; the dev badge disappears.

## Dependencies & licences

None of its own.

## Limits

- The redirect page lives in the owner's `portfolio` Pages repo, not here.
- `portfolio <section>` only focuses an open window (no props-update API).
- Nothing persists: a session restore reopens the window, and the tour plays again.
- The desktop prototype (widgets, `portfolio setup`, a window per section) was dropped on 2026-10-23; see the [brainstorm](../brainstorm/2026-10-22_portfolio-app.md).

## Decisions

- [Portfolio brainstorm](../brainstorm/2026-10-22_portfolio-app.md): solo entry, `kernel.mode` stable, `whoami`, the concept rounds, split A becoming the app.
