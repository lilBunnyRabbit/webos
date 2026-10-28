<script lang="ts">
  import kernel, { search_apps, UiOverlay, type AppId, type AppListing, type AppsService, type UiService, type WindowsService } from "$lib/core/api";
  import { group_by_letter, LETTERS } from "$lib/core/api/services/apps/letters";
  import { clamp, cn } from "$lib/core/utils";
  import type { Position } from "$lib/core/utils/type";
  import { HOLD_MS } from "$lib/core/utils/long-press";
  import { motion_ms } from "$lib/core/utils/motion";
  import { MagnifyingGlass as MagnifyingGlassIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import { fade } from "svelte/transition";
  import { flushSync, untrack } from "svelte";
  import AppRow from "../apps/app-row.svelte";
  import { app_menu } from "../apps/app-actions";
  import { SentenceSearch } from "../apps/sentence-search.svelte";
  import { Button, IconButton, Input } from "../ui";
  import { autoscroll_step, clamp_offset, drop_index, shift_of, type Slot } from "./home-drag";
  import { home_gesture } from "./home-gesture";

  let { onlaunch }: { onlaunch: (id: AppId) => void } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  const ui = $derived(kernel.service<UiService>("ui"));
  const windows = $derived(kernel.service<WindowsService>("windows"));

  /** Past this far left of the rail the finger stops picking letters and starts picking apps. */
  const PICK_ZONE = 32;
  const DRAG_SLOP = 8;

  const installed = $derived(apps.listings({ installed: true }));
  const by_letter = $derived(group_by_letter(installed));
  const filled = $derived(LETTERS.filter((letter) => by_letter.has(letter)));

  let query = $state("");
  const filtering = $derived(query.trim() !== "");
  const matches = $derived(filtering ? search_apps(installed, query) : installed);
  const shown = $derived(filtering ? group_by_letter(matches) : by_letter);
  const sections = $derived(LETTERS.filter((letter) => shown.has(letter)));
  const gettable = $derived(filtering ? search_apps(apps.listings({ installed: false }), query) : []);
  $effect(() => {
    if (filtering) void apps.catalogue();
  });
  // No AI row: phones have no on-device model.
  const sentence = new SentenceSearch<AppListing>({ apps: () => apps.listings(), query: () => query, shown: () => [...matches, ...gettable] });
  const best = $derived(matches[0] ?? gettable[0] ?? sentence.related[0]);

  const favourites = $derived(apps.favourites.flatMap((id) => apps.get(id) ?? []));

  /** Hold a favourite and move to reorder it; hold and let go for its menu. Lives only while a finger is down. */
  interface Drag {
    id: AppId;
    from: number;
    start: Position;
    point: Position;
    moving: boolean;
    /** In list coordinates, measured once the row first moves; transforms don't touch `offsetTop`. */
    origin: number;
    slots: Slot[];
    stride: number;
    offset: number;
    to: number;
  }
  let drag = $state<Drag | null>(null);
  let favourites_list: HTMLElement | null = $state(null);
  let frame = 0;

  /** Lives only while a finger is down, so it stays here rather than in `ui`. */
  interface Scrub {
    letter: string;
    y: number;
    pick: AppId | null;
    pointer: number;
    rail: DOMRect;
  }
  let scrub = $state<Scrub | null>(null);
  let letter = $state(LETTERS[0]);

  /** Browse mode is the launcher overlay (ADR-028), so Back, Home and an app taking focus close it like any other layer. */
  const browsing = $derived(ui.overlay === UiOverlay.LAUNCHER);
  const open = $derived(scrub !== null || browsing);
  const current = $derived(scrub?.letter ?? (browsing ? letter : null));

  let rail: HTMLElement | null = $state(null);
  let panel: HTMLElement | null = $state(null);
  let filter: HTMLInputElement | null = $state(null);
  let opener: HTMLElement | null = null;
  let was_open = false;
  /** Focusing the field on a touch open would raise the phone's keyboard over the list. */
  let touch = false;

  // Before the DOM update: the home content goes inert in it, which would drop the focus to the body.
  $effect.pre(() => {
    if (!open || was_open) return;
    const active = document.activeElement;
    opener = active instanceof HTMLElement && active !== document.body ? active : null;
  });

  $effect(() => {
    const now = open;
    untrack(() => {
      if (now && !was_open && !scrub) arrive();
      else if (!now && was_open) leave();
      was_open = now;
    });
  });

  function arrive() {
    letter = sections[0] ?? LETTERS[0];
    panel?.scrollTo({ top: 0 });
    if (touch || !filter) panel?.focus({ preventScroll: true });
    else filter.focus({ preventScroll: true });
  }

  function leave() {
    query = "";
    favourite_cancel();
    const back = opener;
    opener = null;
    if (!windows.get_focused() && back?.isConnected) back.focus({ preventScroll: true });
  }

  function letter_at(y: number, area: DOMRect): string {
    return LETTERS[clamp(Math.floor(((y - area.top) / area.height) * LETTERS.length), 0, LETTERS.length - 1)];
  }

  function close() {
    scrub = null;
    if (browsing) ui.close();
  }

  function launch(id: AppId) {
    close();
    onlaunch(id);
  }

  function scrub_start(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || !rail) return;
    const area = rail.getBoundingClientRect();
    rail.setPointerCapture(event.pointerId);
    query = "";
    flushSync(() => (scrub = { letter: letter_at(event.clientY, area), y: event.clientY, pick: null, pointer: event.pointerId, rail: area }));
    if (panel) panel.scrollTop = 0;
    navigator.vibrate?.(4);
  }

  function scrub_move(event: PointerEvent) {
    if (!scrub || event.pointerId !== scrub.pointer) return;
    if (event.clientX >= scrub.rail.left - PICK_ZONE) {
      const next = letter_at(event.clientY, scrub.rail);
      if (next !== scrub.letter) navigator.vibrate?.(4);
      scrub.letter = next;
      scrub.y = event.clientY;
      scrub.pick = null;
      return;
    }
    const rows = panel ? [...panel.querySelectorAll<HTMLElement>("[data-scrub-app]")] : [];
    const row = rows.find((element) => {
      const rect = element.getBoundingClientRect();
      return event.clientY >= rect.top && event.clientY < rect.bottom;
    });
    const pick = row?.dataset.scrubApp ?? null;
    if (pick && pick !== scrub.pick) navigator.vibrate?.(4);
    scrub.pick = pick;
  }

  function scrub_end(event: PointerEvent) {
    if (!scrub || event.pointerId !== scrub.pointer) return;
    if (scrub.pick) launch(scrub.pick);
    else release();
  }

  // A cancel is the browser taking the touch (Android's edge back swipe), not a tap: nothing opens, and a list the scrub started from stays.
  function scrub_cancel(event: PointerEvent) {
    if (!scrub || event.pointerId !== scrub.pointer) return;
    flushSync(() => (scrub = null));
    follow();
  }

  /** The held section must not move: the list scrolls by however far filling in the other letters shifted it. */
  function release() {
    if (!scrub || !panel) return;
    const held = scrub.letter;
    const at = LETTERS.indexOf(held);
    const anchor = by_letter.has(held)
      ? held
      : (filled.find((entry) => LETTERS.indexOf(entry) > at) ?? filled.filter((entry) => LETTERS.indexOf(entry) < at).pop() ?? held);
    const before = panel.querySelector<HTMLElement>(`[data-scrub-letter="${held}"]`)?.getBoundingClientRect().top ?? 0;
    flushSync(() => {
      scrub = null;
      letter = anchor;
      ui.open(UiOverlay.LAUNCHER);
    });
    const after = panel.querySelector<HTMLElement>(`[data-scrub-letter="${anchor}"]`)?.getBoundingClientRect().top;
    if (after !== undefined) panel.scrollTop += after - before;
    // The panel opened under the finger, so the effect's arrival never ran; the field would raise the keyboard.
    // The rail's mousedown is prevented, or a tap's compatibility mousedown would blur this back to the body.
    panel.focus({ preventScroll: true });
  }

  function favourite_pick(id: AppId, point: Position) {
    const from = favourites.findIndex((manifest) => manifest.id === id);
    if (from === -1) return;
    navigator.vibrate?.(8);
    drag = { id, from, start: point, point, moving: false, origin: 0, slots: [], stride: 0, offset: 0, to: from };
  }

  function favourite_follow() {
    if (!drag?.moving || !favourites_list) return;
    const y = drag.point.y - favourites_list.getBoundingClientRect().top;
    drag.offset = clamp_offset(drag.slots, drag.from, y - drag.origin);
    const to = drop_index(drag.slots, drag.from, drag.offset);
    if (to !== drag.to) navigator.vibrate?.(4);
    drag.to = to;
  }

  function favourite_move(point: Position) {
    if (!drag || !favourites_list) return;
    drag.point = point;
    if (!drag.moving) {
      if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) <= DRAG_SLOP) return;
      const rows = Array.from(favourites_list.querySelectorAll<HTMLElement>(":scope > [data-home-name]"));
      drag.slots = rows.map((row) => ({ top: row.offsetTop, height: row.offsetHeight }));
      drag.stride = drag.slots[drag.from].height + (parseFloat(getComputedStyle(favourites_list).rowGap) || 0);
      drag.origin = drag.start.y - favourites_list.getBoundingClientRect().top;
      drag.moving = true;
      frame = requestAnimationFrame(favourite_autoscroll);
    }
    favourite_follow();
  }

  function favourite_autoscroll() {
    if (!drag?.moving || !panel) return;
    const rect = panel.getBoundingClientRect();
    const step = autoscroll_step(drag.point.y, rect.top, rect.bottom);
    if (step !== 0) {
      panel.scrollTop += step;
      favourite_follow();
    }
    frame = requestAnimationFrame(favourite_autoscroll);
  }

  function favourite_drop(point: Position) {
    const finished = drag;
    drag = null;
    cancelAnimationFrame(frame);
    if (!finished) return;
    if (finished.moving) {
      if (finished.to !== finished.from) apps.move_favourite(finished.id, finished.to);
      return;
    }
    const manifest = apps.get(finished.id);
    if (manifest) void app_menu(manifest, point, { on_launch: close });
  }

  function favourite_cancel() {
    drag = null;
    cancelAnimationFrame(frame);
  }

  function favourite_translate(index: number): string | undefined {
    if (!drag?.moving) return undefined;
    const y = index === drag.from ? drag.offset : shift_of(index, drag.from, drag.to, drag.stride);
    return y === 0 ? undefined : `0 ${y}px`;
  }

  function follow() {
    if (scrub || !panel) return;
    // The held letter sat at the top of the content box, so browsing reads the current letter off the same line.
    const line = panel.getBoundingClientRect().top + parseFloat(getComputedStyle(panel).paddingTop) + 1;
    let next = sections[0];
    for (const section of panel.querySelectorAll<HTMLElement>("[data-scrub-letter]")) {
      if (section.getBoundingClientRect().top > line) break;
      next = section.dataset.scrubLetter!;
    }
    if (next && next !== letter) letter = next;
  }
</script>

<svelte:window onpointerdowncapture={(event) => (touch = event.pointerType === "touch")} onkeydowncapture={() => (touch = false)} />

{#snippet row(app: AppListing)}
  <li class="flex items-center gap-2">
    <AppRow
      manifest={app}
      data-scrub-app={app.id}
      on_menu={(point) => void app_menu(app, point, { on_launch: close })}
      onclick={() => launch(app.id)}
      class={cn("min-w-0 flex-1", scrub?.pick === app.id && "bg-primary/14 text-primary")}
    />
    {#if !apps.is_installed(app.id)}
      <Button size="sm" pressed class="shrink-0" aria-label="Install {app.name}" onclick={() => apps.install(app.id)}>Install</Button>
    {/if}
  </li>
{/snippet}

{#if open}
  <button
    type="button"
    tabindex="-1"
    class="absolute inset-0 z-20 cursor-default bg-(--overlay) backdrop-blur-sm"
    transition:fade={{ duration: motion_ms(150) }}
    aria-label="Close"
    onclick={close}
  ></button>
  <!-- svelte-ignore a11y_click_events_have_key_events -- Escape closes it from the keyboard; the click is the scrim tap through the empty padding. -->
  <div
    bind:this={panel}
    role="dialog"
    aria-label={scrub ? `Apps starting with ${scrub.letter}` : "All apps"}
    tabindex="-1"
    onscroll={follow}
    onclick={(event) => !(event.target as Element).closest("button, input, [role=status]") && close()}
    class={cn(
      "absolute top-[env(safe-area-inset-top)] right-26 bottom-0 left-0 z-30 overflow-y-auto overscroll-contain px-4 pt-[30cqh] pb-[70cqh] outline-none [scrollbar-width:none]",
      scrub && "pointer-events-none"
    )}
    transition:fade={{ duration: motion_ms(150) }}
  >
    {#if !scrub}
      <!-- Lives in the panel's top padding, so it never shifts the held letter. -->
      <header class="-mt-[30cqh] flex h-[30cqh] flex-col justify-end gap-3 px-2 pb-6" in:fade={{ duration: motion_ms(150) }}>
        <div>
          <p class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">All apps</p>
          <p class="text-ui text-foreground/80"><span class="font-mono tabular-nums">{installed.length}</span> installed</p>
        </div>
        <div class="flex items-center gap-2">
          <Input
            class="flex-1"
            bind:value={query}
            bind:element={filter}
            size="lg"
            type="search"
            placeholder="Filter apps"
            aria-label="Filter apps"
            enterkeyhint="go"
            onkeydown={(event) => {
              if (event.key === "Enter" && filtering && best) launch(best.id);
            }}
          >
            {#snippet leading()}<MagnifyingGlassIcon weight="bold" />{/snippet}
          </Input>
          <IconButton label="App Store" size="lg" class="size-11 shrink-0 [&_svg]:size-6" onclick={() => launch("app-library")}><SquaresFourIcon weight="duotone" /></IconButton>
        </div>
      </header>
    {/if}
    {#if !scrub && !filtering && favourites.length > 0}
      <section class="pb-5" aria-labelledby="letter-index-favourites" in:fade={{ duration: motion_ms(150) }}>
        <p id="letter-index-favourites" class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Favourites</p>
        <ul
          bind:this={favourites_list}
          class="relative flex flex-col gap-0.5"
          {@attach home_gesture({
            hold_ms: () => HOLD_MS,
            mouse_drags: () => true,
            on_pick: favourite_pick,
            on_move: favourite_move,
            on_drop: favourite_drop,
            on_cancel: favourite_cancel,
            on_menu: (id, point) => {
              const manifest = apps.get(id);
              if (manifest) void app_menu(manifest, point, { on_launch: close });
            },
          })}
        >
          {#each favourites as manifest, index (manifest.id)}
            {@const lifted = drag?.id === manifest.id}
            <li
              data-home-name={manifest.id}
              class={cn("relative", drag?.moving && !lifted && "transition-[translate] duration-200 ease-out", lifted && "z-10")}
              style:translate={favourite_translate(index)}
            >
              <AppRow
                {manifest}
                onclick={() => launch(manifest.id)}
                class={cn("transition-[background-color,scale,box-shadow]", lifted && "scale-[1.02] bg-background-light/90 shadow-popover")}
              />
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    {#each scrub ? [scrub.letter] : sections as section (section)}
      <section data-scrub-letter={section} class="pb-5" aria-label={section} in:fade={{ duration: scrub ? 0 : motion_ms(150) }}>
        <p class={cn("px-2 pb-1 text-2xl font-medium transition-colors duration-150", section === current ? "text-primary" : "text-foreground/65")} aria-hidden="true">
          {section}
        </p>
        <ul class="flex flex-col gap-0.5">
          {#each shown.get(section) ?? [] as app (app.id)}
            {@render row(app)}
          {:else}
            <li class="px-2 py-3 text-base text-foreground/65">No apps under {section}</li>
          {/each}
        </ul>
      </section>
    {/each}
    {#if !scrub && gettable.length > 0}
      <section class="pb-5" aria-labelledby="letter-index-get">
        <p id="letter-index-get" class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Not installed</p>
        <ul class="flex flex-col gap-0.5">
          {#each gettable as app (app.id)}
            {@render row(app)}
          {/each}
        </ul>
      </section>
    {/if}
    {#if !scrub && sentence.related.length > 0}
      <section class="pb-5" aria-labelledby="letter-index-related">
        <p id="letter-index-related" class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Related</p>
        <ul class="flex flex-col gap-0.5">
          {#each sentence.related as app (app.id)}
            {@render row(app)}
          {/each}
        </ul>
      </section>
    {/if}
    {#if !scrub && filtering && !best && !sentence.pending}
      <p class="px-2 py-3 text-base text-foreground/65">No apps match</p>
    {/if}
  </div>
{/if}

<!-- Pointer only: the All apps row is the way in for the keyboard and screen readers. -->
<nav class="absolute top-[env(safe-area-inset-top)] right-0 bottom-0 z-30 flex w-11 flex-col items-center justify-center py-6" aria-hidden="true">
  <div
    bind:this={rail}
    role="presentation"
    class="relative flex h-full max-h-[34rem] w-full touch-none flex-col items-center"
    onpointerdown={scrub_start}
    onpointermove={scrub_move}
    onpointerup={scrub_end}
    onpointercancel={scrub_cancel}
    onlostpointercapture={(event) => event.pointerId === scrub?.pointer && release()}
    oncontextmenu={(event) => event.preventDefault()}
    onmousedown={(event) => event.preventDefault()}
  >
    {#each LETTERS as entry (entry)}
      <span
        data-wallpaper-label
        class={cn(
          "grid min-h-0 w-full flex-1 place-items-center text-2xs font-semibold transition-[scale,color] duration-150 ease-out",
          current === entry ? "scale-150 text-primary" : by_letter.has(entry) ? "text-foreground/80" : "opacity-38"
        )}
      >
        {entry}
      </span>
    {/each}
    {#if scrub}
      <span
        class="pointer-events-none absolute right-full mr-3 grid size-14 -translate-y-1/2 animate-pop-in place-items-center rounded-full bg-primary text-3xl font-semibold text-background shadow-popover"
        style:top="{scrub.y - scrub.rail.top}px"
        aria-hidden="true"
      >
        {scrub.letter}
      </span>
    {/if}
  </div>
</nav>
