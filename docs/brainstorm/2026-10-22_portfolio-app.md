# Portfolio app
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
The owner wants a Portfolio app inside WebOS, with the copy and the publication rules prepared in the private `cv` repo (`docs/portfolio/brief.md`, `content.md`, `projects.md`). Two audiences: recruiters, who must see who, role, experience, selected work and contact within seconds without knowing an OS; engineers, who go deeper (the WebOS case study, ADR links) and launch the projects that already are WebOS apps. `https://lilbunnyrabbit.github.io/portfolio` must land on it. Every block in the copy carries a label: OK (publish), DRAFT (publish after the owner reads it), GATED (needs approval, not shown), NEVER.

## Decisions
- **Entry: solo link**, `#/solo/portfolio` (ADR-047). No intro, no Restore, reload-safe, zero core change; the solo bar's Open WebOS is the way into the desktop. Rejected for now: a new core route (ADR-010's unbuilt `#/demo/{name}`) showing the full desktop with Portfolio in front and the intro suppressed. It needs RouterService to tell VersionService to skip the intro, a coupling between the two and a risk to first-run behaviour; it can come later without breaking solo links. Strongest argument against solo, accepted: a visitor never sees the desktop unless they click.
- **`kernel.mode` is stable app API.** In solo, `apps.launch()` of another app only toasts "Open WebOS", pointing at the solo app itself, so a project's Open in WebOS would never reach its target. Portfolio reads `kernel.mode`: full mode launches the app; solo renders a link to `#/app/{id}?{props}` in a new tab. Rejected: changing `SoloAppsService.launch()` so its toast opens the requested app (behaviour change for every app, and still two clicks); reading `kernel.mode` as internal API.
- **Shell: `whoami`**, contributed by the app. Yields one `profile` value (name, role, email); clicking it opens Portfolio. An easter egg, never the only route. Rejected: nothing; also a `portfolio [section]` command.
- **Other ways in:** App Library highlights, a "Meet the maker" group in the intro's interests, a Getting started topic.
- **Tone (owner):** "The portfolio needs to be cool and really tailored to me. Like in my personal time working on webos, chromatics, task manager is kinda my 'brand' - by ideas i have and my interests." Own projects lead: the home page shows them before the employment history, and Projects comes second in the navigation.
- **Layout:** the repo's `SideNav` section pattern (sidebar from `@2xl`, tab row below), one section at a time, `section` prop picks the first. Not drill-in: a phone visitor must land on the home page, not a list.
- **Content as typed records** in `content/*.ts`, each block with `status: ok | draft`. GATED and NEVER material never enters the files. Draft blocks get a "Draft" badge in dev builds only. A test guards against phrases from the NEVER list.
- **Project buttons only where the target works**: Open in WebOS only when the app is registered (a fork without it shows none), Live / Source / npm / Docs as links to new tabs, none on a private repo, no Live on a CLI.

## Design round (same day)
- Owner on the first build: "kinda looks plain and boring", "Really needs to be interactive and cool. im a frontend engineer", "Really take your time with this. experiment." Pointed at the GitHub profile README for links and at the hq design references (Emil Kowalski, Impeccable, Taste).
- **The desk**: the home page became a small desktop, live demos of the owner's own work: a terminal that navigates the page, a contrast check of the live theme (the idea behind Chromatics), a real Task Manager pipeline on TasksService, a dock of WebOS apps. Draggable with a mouse, clamped and edge-snapped like WebOS windows; a swipe row on narrow screens.
- **Two expert reviews** (one Fable, one Opus, owner's explicit exception to the no-Fable rule), read-only. Adopted: experience in the first screen next to the hero, desk below; one lead window instead of four equal cards; LinkedIn and GitHub only in the hero, the other profile links on Contact (draft until approved); honest copy (the contrast window isn't Chromatics, the pipeline lanes do real work, "some", not "most", projects run in WebOS, Task Manager doesn't run "every zip"); "Sole author" replaced, since LaxDOTexe is credited on five apps; a Result block and a measured trade-off on the WebOS page; sentence-case headings instead of caps eyebrows; fewer mono labels.
- Not adopted, for the owner: nav order (recruiter order puts Experience before Projects; kept Projects second per the owner's "brand" note); a release gate that fails while drafts remain (would block CI until sign-off); dropping game-clip.

## Concept rounds and the portfolio desktop (same day)
- 22 concepts, then round 4 (lab: `flow`, `tour`, `split`, `timeline`). Owner's notes driving round 4: loves the particles; terminal for quick search; guided, no clicking around; no blocks of text; work as a timeline; projects as contained cards; cool motion. "How I build": standard practice is a few short approach statements proven by the work, not an essay.
- Owner idea: "full WebOS experience with apps of my portfolio, widgets and all". Options weighed: (A) prototype on existing APIs, (B) a new showcase kernel mode like solo (ADR-047) with an in-memory desktop and session seeded from a manifest field, (C) a simulated desktop inside one window.
- **Decided: (A) prototype on existing APIs**, no core change. The `portfolio` app keeps its `section` prop (one window per section), gains a manifest `widget` with a `kind` prop, and a setup flow (`?setup` prop) that pins the widgets and opens arranged windows. Known cost: it writes into the visitor's real `/home/Desktop` and session, and first-boot dialogs come first. If it lands, (B) is the follow-up decision (ADR).
- **Wallpaper**: widget only, no particles live wallpaper.
- **Shell**: `portfolio setup` (same as the link) and `portfolio [section]` through the manifest `shell`.

## Split picked (2026-10-23)
- Owner: "full focus on split, i like the direction." Notes: logo particles in primary only; terminal hard to read; less info above it; contact window over-sized; principle highlights stay but without layout shift, with animation; research GitHub (profile README, highlighted projects) for more to show, smaller things get a smaller focus; project graphics should depict the real projects.
- **Windows: split keeps its own in-app window**, no core change. Core `window.svelte` and `WindowGeometryHandler` are bound to WindowsService ids, so an app can't mount them. Owner: reference the real window heavily ("it's really polished there"). Rejected: a presentational `WindowFrame` in the kit shared with core (core refactor for one concept); real WebOS windows (impossible in solo, needs the showcase-mode ADR).
- **Polish loop:** five rounds of three fresh reviewers each (design, mobile and motion, audience), given only the spec, with a fix round after each. Owner: "I don't want to see 'still weak' for things that you can solve."
- **Round 5 design calls (lead):**
  - **Layout:** the resting layout is fixed for the whole visit (Who I am | Work | Side projects), and nothing re-tiles after the tour; clicks highlight and scroll instead.
  - **Terminal:** it docks as a command bar, with its output in a wide popover.
  - **Proof:** each principle's proof sits inline in the caption band.
  - **Logo:** the caption waits for the particle swarm to land, and the logo mark is static until the canvas paints.
  - **Chromatics:** the demo computes its own failing seed (the primary hue) when a theme has no visible failing pair.
- **Loop stopped after round 6 (2026-10-23).** Owner: it "seems worse now". Fixing one line of work against reviewers who only had the spec kept the scores flat at about 6, and the direction drifted.
  - The saved rounds are viewable as concepts `split-r2` … `split-r5`.
- **Owner's verdict:**
  - The terminal is always visible.
  - Work is a vertical timeline, never horizontal.
  - The project graphics became far too complex.
  - Smaller things are cards.
  - How I build is its own window.
  - Contact is a window floating over the windows.
  - Keep the current way windows appear, with the terminal still visible.
- **Next:** three variations built in parallel (A terminal rail, B dock, C desktop), plus `split-original`, the pre-polish state rebuilt from the session transcripts.
- **A vs C (2026-10-23).** Owner: "kinda split between a and c", mobile good on both, motion "klunky sometimes". C's cascaded opening dropped (it overlapped Who I am's text); windows open straight into tiles.
- **Round A/C 1:**
  - Contact is a centred layer with a dark scrim over the whole concept (not `showModal()`: the top layer would cover the WebOS desktop around the app).
  - The motion fixes from frame sheets, and responsiveness checked across 16 sizes, short desktops included.
  - How I build keeps all six titles in view.
- **Leaning A (owner):** "the terminal in window simply just takes up too much space for other content". The Who I am logo morphing into the lit principle's glyph is a keeper: it applies to tour beats and to focusing a How I build item, in A and C. A lead misread had briefly dropped it.
- **Round A/C 2 asks:**
  - Contact redesigned as a compose window, with particles across its whole left pane.
  - Who I am gets an availability and socials footer bar, and its particles use the whole window body.
  - While True splits into client engagements like the CV, each line derived from the OK summary.
  - Principles reach more projects through `Project.shows`.
  - Petrace's graphic gets a new subject.
  - The clock reads "in Ig".
- **split-a becomes the Portfolio app (owner, 2026-10-23).** "remove all other portfolio variants and make … split-a the main portfolio app. This will ease our development of it."
  - Decided: the lean surface.
    - `section` takes split-a's windows (`who`, `work`, `projects`, `how`, `contact`). It opens that window, skips the tour and focuses it.
    - The `whoami` command and `portfolio [section]` stay, with the new section ids.
  - Dropped: the desktop prototype (option A above): the `setup` and `kind` props, the widgets, and `portfolio setup`.
  - Deleted: every `portfolio-*` concept app and the lab. A tar of the deleted folders is kept in the session scratchpad; nothing was committed before.
  - Strongest argument against, accepted: the "full WebOS with widgets" experiment is gone and would have to be rebuilt.
  - Done 2026-10-23: `portfolio/` is split A (`portfolio.app.svelte`, `desk/`, `particles/`), with the `section` prop and `portfolio [section]`; the concept apps, the lab and the prototype are deleted ([internals](../apps/portfolio.md)).
- **Content (owner):**
  - Petrace and Series Tracker are featured.
  - quno ("part of hq now") and Static Utils ("it's webos now") are removed.
  - The packages card lists the three packages.
  - A new `IN_PROGRESS` group holds Animot (Speed Reader's successor) and Threadbridge. The cv repo still lists Threadbridge as private and excluded; the owner decides there.

## Key takeaways
- Counts that move (apps) come from the registry; ADR and test counts are stated with their date.
- The `/portfolio` redirect lives in the owner's `portfolio` Pages repo, drafted here, not pushed.

## Action items
- [x] Portfolio app, `whoami`, highlights, interest group, Getting started topic, `kernel.mode` in app-api.md, docs, changelog.
- [x] Owner signs off the DRAFT blocks before release (2026-10-24: all approved, every `status` is `ok`).
- [ ] Redirect page into the `portfolio` repo (owner).
- [x] Portfolio desktop prototype (A), 2026-10-23: widget kinds `particles` (the logo field, engine imported from `portfolio-particles`), `now` (name, role, availability, Email / LinkedIn / GitHub) and `work` (the jobs as bars on one line); `#/app/portfolio?setup=true` and `portfolio setup` pin them once each (left half: cards on top, field below) and snap Experience top-right, Projects bottom-right; one Home window on a phone; `portfolio [section]` opens or brings forward one section. Experience became a drawn timeline, Projects contained cards with particle marks (2D canvas dots). Details: [Portfolio](../apps/portfolio.md#the-portfolio-desktop-prototype).
- [-] Moot since the prototype was dropped (2026-10-23). Owner: try the portfolio desktop. Findings for the (B) decision: first-boot intro covers it (setup runs behind); `portfolio setup` refuses on a fresh profile until Portfolio is installed (ADR-040; the link installs it); arranging is limited to snap halves and quarters; the quarter windows still show the section sidebar at 1440 px.
- [x] Consolidate the particle engine into `portfolio/` (or the kit) once a concept is picked (done 2026-10-23: `portfolio/particles/`); the widget and the project marks import it from `portfolio-particles` today.

## Visual backlog (owner, 2026-10-23, after split-a becomes the app)
- **Background gradients** like the ones on the brand page (https://lilbunnyrabbit.github.io/brand/): soft gradients behind the desk and the windows. They're built from theme tokens only, so they can't add new colours. Read how `brand` builds them before designing.
- **Work timeline:** a visual rework, tweaks only; the structure (vertical, While True split into engagements) stays.
  - Idea (owner): "More" should feel like a **reveal**, not just more content appended below. For example, the case study unfolds as a staged reveal (context → my role → decisions → result) inside or over the entry, with motion that shows what opened, rather than the list growing taller.
- **How I build:** a visual rework. It "looks plain and empty" today.
- **Projects:** a few more passes on the featured cards, and on how the small projects (and In progress) are presented.
  - **Graphic replay control:** rework it. Owner: "i hate how play for animations for projects is positioned and looks". Today it's a small round play button floating in the graphic's top-right corner. Directions to explore:
    - replay on hover/tap of the whole graphic, with a subtle hint;
    - a control built into the graphic's own frame (e.g. a scrubber or progress line along the bottom edge that also replays);
    - looping quietly while in view, so no button is needed.
    - It must work on touch and keyboard, with no hover-only action.
- **Content pass**, still open from `content-proposals.html` (session scratchpad):
  - the owner signs off the DRAFT blocks;
  - Astra's end date: "Oct 2026" or "Present";
  - whether the case-study outcomes become the visible bullets;
  - the CV link and a `cv` command;
  - the principle set;
  - the "Side projects" title;
  - the new drafts: In progress (Animot, Threadbridge), the package lines, the `shows` proof sentences, the Contact composer's placeholders, and the "in Ig" clock.
  - The cv repo has drifted from this content, and the owner fixes it there:
    - quno, Static Utils and Threadbridge;
    - Petrace and Series Tracker, which are now featured;
    - Cosylab's role wording in `cv.html`.
- Same working method: snapshot each round, check with the owner every round, no blind loops.

### How the visual passes run (owner, 2026-10-23)
"We will do visual passes by you providing switches i can toggle … just spawn agents to work on it."

- **Switches:**
  - A **Variants** panel inside the Portfolio app, for dev builds only (`import.meta.env.DEV`), opened from a small button in the solo bar or with `?variants`.
  - One segmented switch per area, with the choice kept in `app.portfolio.variants` localStorage (ADR-003), so the owner can flip between options live.
  - Every option is a real, finished build, not a sketch.
  - Once the owner picks, the losing options and the panel are deleted.
- **Order of work:**
  1. Merge split-a into `portfolio/`.
  2. One agent builds the panel.
  3. One agent per area works in parallel, each owning its own files.
- **The content pass** waits for the owner's answers; agents only prepare proposals for it.

- **Variants v1 built (2026-10-23):**
  - The panel, plus every B/C/D option in five areas; option A is unchanged.
  - The internals are in `docs/apps/portfolio.md` under Variants.
  - The comparison sheet is in the session scratchpad at `split-polish/variants-v1/index.html`.
  - Agents' picks: backdrop C, terminal B, work rail B with More B, how C, small projects C, replay C.
  - Waiting on the owner's picks.
- **Owner's picks, v1 (2026-10-23):**
  - **Backdrop:** more options. "doesnt need to include primary can just be lighter to darker background": neutral shade ramps, no brand colour.
  - **Terminal:** D, the split rail, is final. "the whole thing should be clickable with visible caret in the editor so i know its selected and that i can start typing."
  - **Work:** none of v1. "explore different layouts of the whole timeline". Vertical stays (an earlier verdict).
  - **How I build:** D, one at a time, is best. Explore it more.
  - **Project cards:** probably bento. Explore more.
  - **Small projects:** shelf. Explore more.
  - **Replay:** B, tap the graphic, is final.
- **Availability (owner):**
  - In Contact only, as a footer bar at the bottom of the window. Contact's links and clock stay in its left pane.
  - Not in Who I am; its footer now holds the social icons only.
  - "maybe in the terminal": a switch, `availability` A (Contact only) or B (the terminal as well).
- **Variants v2:**
  - Final picks become the only implementation, and their switches go.
  - Explored areas keep the owner's pick as option A and add new options on top of it.

### Ideas per area (option A is the current state where one exists)
| Area | Options | Why | How |
|---|---|---|---|
| Backdrop | A none · B aurora · C focus glow · D grain + vignette | Brand page depth; one memorable layer | B: 2–3 large radial gradients from primary/accent tokens at low alpha, drifting slowly (CSS `@property` angle/position). C: a soft spotlight behind the focused window, moving with focus. D: a static two-stop gradient plus a fine noise layer. All are token-only, light and dark, and still under reduced motion |
| Work rail | A current · B proportional rail · C lit rail | Make time readable at a glance | B: node spacing scales with years, plus small year ticks. C: the rail is a gradient that brightens toward the current role, and nodes glow when lit |
| Work "More" | A inline · B staged reveal · C sheet over entry | Owner: a reveal, not more text | B: the case study unfolds block by block (context → role → decisions → result), each sliding in. C: a sheet rises over the entry, anchored to it, and closes back into it (View Transition) |
| How I build | A list · B glyph grid · C evidence threads · D one-at-a-time | "Plain and empty" | B: a 2×3 grid of tiles, each with a large glyph (the same glyph the logo morphs into), the title and the line. C: hovering or focusing a row draws thin lines to the cards and jobs that show it. D: one principle large, with a pager and its proof chips; the tour drives it |
| Featured cards | A current · B full-bleed · C bento | More premium | B: the graphic is full-bleed at the top with the title over a fade. C: mixed sizes, WebOS large, the rest in a 2:1 rhythm |
| Small projects | A cards · B shelf · C `ls -l` | Better presentation | B: compact tiles with a monogram or icon, the line on hover/focus (always shown on touch). C: terminal-style rows (name, line, links) that match the rail |
| Terminal rail | A current · B grouped transcript · C now-playing header · D split rail | Owner: "kinda hard to see what is going on" | B: each command and its output is one block, with a timestamp gutter. The current block is lit; older ones fade and collapse to a single line. Output values are clickable chips. C: a header strip names the current tour step ("Opening Work…") with a progress bar, and the log sits below. D: the top half is the live step with large type, the bottom half the scrollback, and the prompt is pinned to the bottom |
| Graphic replay | A corner button · B tap graphic · C progress edge · D loop in view | Owner hates the button | B: the whole graphic is the button, with a small hint on hover/focus. C: a thin progress line along the bottom edge that replays on tap. D: a quiet loop while on screen, paused off screen and under reduced motion |

## Content pass and v2 picks (2026-10-23)
- **Portfolio is not the CV.** A reviewer proposed a recruiter-first restructure (Experience and Selected work first, CV-style proof). Owner: "make the distinction from CV and portfolio... porfrolio IMO should be more like showcasing who am i as a developer". The CV is an optional download (`cv` command, Contact link); the page doesn't mirror it.
- **Copy pass applied (all DRAFT):** How I build reworked as the page's spine: `earn-its-place` merged into `lightest`, new `team` ("Make the next change easy"), `feel` UX-only, no hard-coded ADR count, React → Svelte dropped as a performance proof. Threadbridge removed, featured reordered, Shows sentences lead with the project name, window title "Projects".
- **v2 verdicts (owner):**
  - Backdrop: lit centre. Final.
  - Availability: Contact only. Final.
  - Project cards: bento and wide column both "work great"; pairs "meh"; feature + strip "terrible to have indexes". Bento kept (wide column squeezes Who I am and Work).
  - Small projects: mini art liked, packages "a bit too different", so it moves to the end; shelf wants more detail; flip and by kind "no".
  - Work: none final. Hates the "More" toggle in every option; chapters better than current but years as '19–'24 and Astra and While True looking different are wrong; case files too dense; git log hard to read.
  - How I build: none final. Hover switching the shown principle is "a terrible experience" in all four; pager shows the same icon three times; deck too loud; index too squished, no detailed Shown in; slides good minus the watermark glyph and the number buttons.
- **Next round:** Work v3 (no More, both jobs one structure, full years, glanceable) and How v3 (refined pager, refined slides, hover no longer switches) as options e and f.

## Next session topics
- A core route that shows the desktop with Portfolio in front, if solo turns out too hidden.
- Updating a window's link as the visitor moves between sections (no props-update API on the window handle today).

## Round v4 (2026-10-24)

Owner feedback on v3 and the content pass, and what was done:

- Work: "like E more but i miss the timeline", no rule above each job, "a lot of empty space bellow for desktop". Built G (E on a rail, spreads by height) and H (time axis, each job owns its years). Owner on H's first cut: "looks like i didnt do anything for 3 years"; fixed by spreading each job's units over its stretch.
- How I build: "both are good but neither is great". Built G (accordion of native `<details>`) and H (split: sticky index + reader when wide, accordion when narrow).
- Projects: WebOS and Chromatics art reworked, then cut to a few plain shapes after "way simpler" / "too many details"; packages card has no art. Art uses the theme's primary/secondary/tertiary/accent, never status colours (Chromatics exempt). Package rows' contrast raised ("barely visible"). Threadbridge restored under In progress.
- Who I am: skills line dropped (projects' stacks say it; the portfolio is not the CV); years and location as tags; location "Ig, Slovenia".
- Work content: "d.o.o." dropped; company sites linked (astra-ai.co, whiletrue.com).
- Contact: intro line removed (owner rejected the rewrite; the compose form explains itself); only LinkedIn and GitHub, labelled, in one row.
- Window motion retune tried (distance-scaled spring re-tiles 460–760 ms) and reverted: Projects jumped and glitched. The dark corner was Work's focused shadow falling across the gap, now drawn on a live layer under the stage, outside the view transition (snapshot-painted shadows banded and snapped off at the end of a re-tile).
- Motion: re-tiles 320 → 460 ms on a gentler curve (Who I am's first move read as a jump); a frame keeps the focused window's brighter edge and the window ring lost its transition (the edge "fading in" when Projects opened); a new window's shadow fades in with it.
- **How I build: D slides picked.** Numbers as "01"–"06" tabs like H's narrow strip, one fixed height, kept under the slide; more spacing in the slide. A, B, C, E–H and their helpers (`how-evidence`, `how-shown-in`) deleted.
- Work I: While True units newest first with their own years from the CV (Blurb Nov 2019–Oct 2024, RPI Aug 2020–Oct 2024, Cosylab 2020, WT.dev undated); the axis marks each unit's start year beside it. Node halo given more room from the company name.
- In progress cards: status always on its own line under the name, so the two cards match.

- **Work I and Packages B picked (2026-10-24), variants panel deleted.** Work A–H and their helpers (`work-entries`, `work-ladder`, `work-more-reveal`, the More/case-section half of `work-more`) deleted; the axis is newest first only. Packages B: one tile per package, a kind badge on every small tile. `variants.ts`, `variants.svelte.ts`, the panel, the `variants` terminal command and `app.portfolio.variants` gone.

No open picks left. 2026-10-24: owner approved every draft; all content is `ok`, no Draft badges remain.
