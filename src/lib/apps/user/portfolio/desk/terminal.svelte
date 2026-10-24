<script lang="ts">
  import { button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    EnvelopeSimple as EnvelopeSimpleIcon,
    FastForward as FastForwardIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Play as PlayIcon,
    SquaresFour as SquaresFourIcon,
    TerminalWindow as TerminalWindowIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { PROFILE } from "../content/profile";
  import { SocialKind } from "../content/types";
  import { SOCIAL_ICONS } from "../social-icon";
  import { RowLayout, suggest, SUGGESTIONS, TOUR, type Suggestion } from "./script";
  import { HIT_LABELS, HitKind, HITS, search } from "./search";
  import { Tone, TourState, type Entry, type Line, type PortfolioSession } from "./session.svelte";
  import Unbroken from "./unbroken.svelte";
  import { now_of } from "./terminal-now";
  import TerminalLive from "./terminal-live.svelte";
  import TerminalSteps from "./terminal-steps.svelte";

  interface Props {
    session: PortfolioSession;
    compact: boolean;
  }

  let { session, compact }: Props = $props();

  const uid = $props.id();
  const anchor = `--portfolio-terminal-${uid.replace(/[^\w-]/g, "")}`;
  const socials = PROFILE.socials.filter((social) => social.kind === SocialKind.LINKEDIN || social.kind === SocialKind.GITHUB);
  const control = button({ variant: "quiet", size: "sm", class: "h-7 gap-1.5 px-2 font-mono text-xs pointer-coarse:h-10 pointer-coarse:min-w-10 pointer-coarse:px-2 [&_svg]:size-3.5" });
  const FALLBACK = HITS.filter((hit) => hit.kind === HitKind.LINK && hit.key === "link-email");
  const TITLE = "~/portfolio";

  const CONTROLS = "a, button, [role='option'], [popover], .scrim";

  let line = $state("");
  let pick = $state(0);
  let cursor = $state(-1);
  let selected = $state(0);
  let input: HTMLInputElement | null = $state(null);
  let sheet: HTMLElement | null = $state(null);
  let sheet_entry = $state<Entry | null>(null);

  const playing = $derived(session.tour === TourState.PLAYING);
  // The desktop shows the tour's typing in the live area, so the prompt stays the visitor's own line. A phone has
  // no live area: its prompt row echoes the typing.
  const shown = $derived(playing ? (compact ? session.typed : "") : line);
  const now = $derived(now_of({ tour: session.tour, step: session.step, typed: session.typed, beat: session.beat, lit: session.lit, cycling: session.cycling }));
  const latest = $derived([...session.log].reverse().find((entry) => !entry.tour) ?? null);
  const searching = $derived(!playing && line.startsWith("/"));
  // Browsing history shows the old line as it was; suggestions come back once the visitor types.
  const suggestions = $derived(playing || cursor >= 0 ? [] : suggest(line, session.stacked));
  const rest = $derived.by(() => {
    const top = suggestions[pick];
    return top && top.line.startsWith(line) ? top.line.slice(line.length).trimEnd() : "";
  });
  const query = $derived(line.slice(1));
  const found = $derived(searching ? search(query) : []);
  const hits = $derived(searching && found.length === 0 && query.trim() ? FALLBACK : found);
  const last = $derived(session.log.at(-1));
  const moved = $derived(Object.keys(session.moved).length > 0);
  const resumable = $derived(session.tour === TourState.PAUSED && session.next_step() < TOUR.length);
  const invite = $derived.by(() => {
    if (playing) return session.coarse ? { idle: "Tap to take over", ready: "Type to take over" } : { idle: "Click or type to take over", ready: "Type to take over" };
    const help = session.coarse ? "help, or tap Search" : "help, or / to search";
    return { idle: help, ready: help };
  });

  // On a phone a typed command's answer opens as a sheet under the header, so the header never grows and pushes the page
  // down. A command that moved the page answered already: a sheet would cover the very thing it opened.
  $effect(() => {
    const entry = last;
    if (!compact || !entry || entry.tour || entry.navigated || entry.lines.length === 0) return;
    untrack(() => {
      sheet_entry = entry;
      if (sheet && !sheet.matches(":popover-open")) sheet.showPopover();
    });
  });

  $effect(() => {
    if (!compact && sheet?.matches(":popover-open")) sheet.hidePopover();
  });

  $effect(() => {
    const entry = last;
    if (compact && entry?.navigated && sheet?.matches(":popover-open")) untrack(() => sheet?.hidePopover());
  });

  // The prompt keeps focus after Enter, so the keyboard stays up under the sheet. Android resizes only the visual
  // viewport for it, which `dvh` doesn't follow: the sheet ends where the visible page ends instead.
  $effect(() => {
    const node = sheet;
    const view = window.visualViewport;
    if (!compact || !node || !view) return;
    const fit = () => {
      if (!node.matches(":popover-open")) return;
      const room = view.offsetTop + view.height - node.getBoundingClientRect().top - 12;
      node.style.maxHeight = `${Math.max(120, Math.min(512, room))}px`;
    };
    view.addEventListener("resize", fit);
    view.addEventListener("scroll", fit);
    node.addEventListener("toggle", fit);
    return () => {
      view.removeEventListener("resize", fit);
      view.removeEventListener("scroll", fit);
      node.removeEventListener("toggle", fit);
    };
  });

  let wants_focus = false;
  $effect(() => {
    const node = input;
    if (node && wants_focus && document.activeElement !== node) untrack(() => node.focus({ preventScroll: true }));
  });

  export function focus_prompt(text = ""): void {
    wants_focus = true;
    session.pause(true);
    line = text;
    pick = 0;
    selected = 0;
    cursor = -1;
    input?.focus({ preventScroll: true });
  }

  // On the desktop a click only readies the prompt: the tour plays on until the first key, which takes over the way
  // typing always has. A phone's tour scrolls the page under the keyboard, so a tap takes over at once. A drag that
  // selected text keeps its selection: the visitor wants to copy.
  function claim(event: MouseEvent) {
    const target = event.target as Element;
    if (target.closest(CONTROLS) || getSelection()?.toString()) return;
    if (compact) session.pause();
    wants_focus = true;
    if (document.activeElement !== input) input?.focus({ preventScroll: true });
  }

  function run(command: string) {
    if (command.startsWith("/")) return focus_prompt(command);
    session.pause(true);
    session.submit(command);
  }

  function take_over(event: KeyboardEvent) {
    session.pause(true);
    line = "";
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      line = event.key;
    } else if (event.key === "Enter" || event.key === "Tab") event.preventDefault();
  }

  function jump(index: number) {
    const hit = hits[index];
    if (hit) session.jump(hit, query);
    line = "";
    if (sheet?.matches(":popover-open")) sheet.hidePopover();
  }

  function wake_caret() {
    for (const animation of input?.getAnimations() ?? []) animation.currentTime = 0;
  }

  function keydown(event: KeyboardEvent) {
    wake_caret();
    if (playing) return take_over(event);
    if (searching) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        selected = (selected + step + hits.length) % Math.max(1, hits.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        jump(selected);
      } else if (event.key === "Escape") {
        event.preventDefault();
        line = "";
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      session.submit(line);
      line = "";
      pick = 0;
      cursor = -1;
    } else if (suggestions.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      pick = (pick + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
    } else if (suggestions.length > 0 && (event.key === "Tab" || (event.key === "ArrowRight" && at_end(event.currentTarget)))) {
      event.preventDefault();
      take(suggestions[pick]);
    } else if (event.key === "Tab") {
      event.preventDefault();
    } else if (event.key === "ArrowUp" && session.history.length > 0) {
      event.preventDefault();
      cursor = Math.min(cursor + 1, session.history.length - 1);
      line = session.history[cursor];
    } else if (event.key === "ArrowDown" && cursor >= 0) {
      event.preventDefault();
      cursor -= 1;
      line = cursor >= 0 ? session.history[cursor] : "";
    } else if (event.key === "Escape" && line) {
      event.preventDefault();
      line = "";
      pick = 0;
    } else if ((event.ctrlKey || event.metaKey) && event.key === "l") {
      event.preventDefault();
      session.submit("clear");
    }
  }

  function at_end(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement && target.selectionStart === target.value.length && target.selectionEnd === target.value.length;
  }

  function take(suggestion: Suggestion | undefined) {
    if (!suggestion) return;
    line = suggestion.line;
    pick = 0;
    input?.focus({ preventScroll: true });
  }

  function typed(event: Event & { currentTarget: HTMLInputElement }) {
    session.pause(true);
    line = event.currentTarget.value;
    pick = 0;
    selected = 0;
    cursor = -1;
  }

  // A phone keeps its keyboard down.
  function tour_action() {
    if (playing) session.skip();
    else if (resumable) session.resume();
    else session.replay();
    if (session.coarse) return;
    wants_focus = true;
    input?.focus({ preventScroll: true });
  }

  function tone_class(out: Line): string {
    if (out.tone === Tone.ERROR) return "text-error";
    return out.tone === Tone.DIM ? "text-foreground/65" : "text-foreground";
  }
</script>

{#snippet mark()}
  <span class="shrink-0 text-primary select-none" aria-hidden="true">~</span>
  <span class="caret-mark shrink-0 text-foreground/65 transition-colors select-none" aria-hidden="true">❯</span>
{/snippet}

{#snippet pair(out: Line)}
  {#if out.layout === RowLayout.BELOW}
    <span class="flex min-w-0 flex-col">
      <span class="min-w-0 break-words">{out.text}</span>
      {#if out.detail}<span class="min-w-0 text-xs break-words text-foreground/65"><Unbroken text={out.detail} /></span>{/if}
    </span>
  {:else}
    <span class="min-w-0 break-words">{out.text}{#if out.detail}{" "}<span class="inline-block max-w-full text-foreground/65">{out.detail}</span>{/if}</span>
  {/if}
{/snippet}

{#snippet out_line(out: Line)}
  {#if out.principle}
    {@const id = out.principle}
    {@const lit = session.lit === id}
    <button
      class={cn("flex min-w-0 items-baseline gap-2 rounded-xs text-left transition-colors duration-300 pointer-coarse:py-2.5", lit ? "text-primary" : "text-foreground hover:text-primary")}
      style:grid-column="1 / -1"
      aria-pressed={lit}
      onclick={() => (session.pause(), session.light(id))}
    >
      <span class={cn("shrink-0 transition-opacity duration-300", lit ? "opacity-100" : "opacity-30")} aria-hidden="true">●</span>
      <span class="min-w-0 break-words">{out.text}</span>
    </button>
    {#if out.detail}<p class="mb-1.5 pl-[calc(1ch+0.5rem)] text-pretty text-foreground/65" style:grid-column="1 / -1">{out.detail}</p>{/if}
  {:else if out.hit}
    {@const hit = out.hit}
    <button
      class={cn("group flex min-w-0 rounded-xs text-left pointer-coarse:py-2.5 [&>span>span:first-child]:transition-colors [&>span>span:first-child]:group-hover:text-primary", tone_class(out))}
      style:grid-column="1 / -1"
      onclick={() => (session.pause(true), session.jump(hit, out.query ?? hit.label))}
    >
      {@render pair(out)}
    </button>
  {:else if out.layout === RowLayout.COLUMNS && out.run}
    {@const command = out.run}
    <button class={cn("cols group grid grid-cols-subgrid items-baseline rounded-xs text-left whitespace-nowrap pointer-coarse:py-2.5", tone_class(out))} style:grid-column="1 / -1" title="Run {command}" onclick={() => run(command)}>
      <span class="transition-colors group-hover:text-primary">{out.text}</span>
      <span class="cols-detail min-w-0 truncate text-foreground/65">{out.detail}</span>
    </button>
  {:else if out.run}
    {@const command = out.run}
    <button class={cn("group flex min-w-0 text-left rounded-xs pointer-coarse:py-2.5 [&>span>span:first-child]:transition-colors [&>span>span:first-child]:group-hover:text-primary", tone_class(out))} style:grid-column="1 / -1" title="Run {command}" onclick={() => run(command)}>
      {@render pair(out)}
    </button>
  {:else}
    <p class={cn("flex min-w-0 text-pretty", tone_class(out))} style:grid-column="1 / -1">{@render pair(out)}</p>
  {/if}
{/snippet}

{#snippet entry_view(entry: Entry)}
  <article class="flex flex-col gap-1">
    {#if entry.input !== null}
      <p class="flex min-w-0 items-baseline gap-2">{@render mark()}<span class="min-w-0 break-words text-foreground">{entry.input}</span></p>
    {/if}
    {#if entry.lines.length > 0}
      <div class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1">
        {#each entry.lines as out, index (index)}{@render out_line(out)}{/each}
      </div>
    {/if}
  </article>
{/snippet}

{#snippet tour_button()}
  {@const label = playing ? "Skip the tour" : resumable ? "Resume the tour" : "Replay the tour"}
  <button class={control} onclick={tour_action} aria-label={label} title={label}>
    {#if playing}<FastForwardIcon weight="bold" /><span class="word">skip</span>{:else if resumable}<PlayIcon weight="bold" /><span class="word">resume</span>{:else}<ArrowCounterClockwiseIcon weight="bold" /><span class="word">replay</span>{/if}
  </button>
{/snippet}

{#snippet search_button(icon_only: boolean)}
  <button class={control} onclick={() => focus_prompt("/")} aria-label="Search" title={icon_only ? "Search" : undefined}>
    <span class="pointer-fine:hidden"><MagnifyingGlassIcon weight="bold" /></span><kbd class="key">/</kbd>{#if !icon_only}<span class="word">search</span>{/if}
  </button>
{/snippet}

{#snippet completions()}
  {#if suggestions.length > 0}
    <ul id="{uid}-suggestions" class="suggestions flex flex-col" role="listbox" aria-label="Suggestions">
      {#each suggestions as suggestion, i (suggestion.line)}
        <li role="option" aria-selected={i === pick}>
          <button
            type="button"
            tabindex="-1"
            class={cn("suggestion flex w-full min-w-0 items-center gap-3 rounded-md px-2 text-left", i === pick && "picked")}
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => take(suggestion)}
          >
            <span class="shrink-0 font-mono text-foreground">{suggestion.word}</span>
            <span class="min-w-0 truncate font-sans text-xs text-foreground/65">{suggestion.detail}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}


{#snippet prompt()}
  <div class="prompt-line flex min-w-0 flex-1 items-center gap-2">
    {@render mark()}
    <span class="field relative flex min-w-0 flex-1 items-center pointer-coarse:text-base">
      <input
        bind:this={input}
        value={shown}
        oninput={typed}
        onkeydown={keydown}
        onfocus={() => (wants_focus = true)}
        onblur={(event) => {
          const node = event.currentTarget;
          queueMicrotask(() => node.isConnected && (wants_focus = false));
        }}
        class="prompt min-w-0 flex-1 bg-transparent [caret-animation:manual] p-0 font-mono text-[length:inherit] text-foreground outline-none pointer-coarse:min-h-10"
        aria-label="Command or search"
        aria-describedby={shown ? undefined : `${uid}-invite`}
        aria-controls={searching ? `${uid}-results` : suggestions.length > 0 ? `${uid}-suggestions` : undefined}
        aria-autocomplete="list"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="go"
      />
      {#if rest && !searching}
        <span class="completion pointer-events-none absolute inset-y-0 left-0 flex items-center font-mono whitespace-pre select-none" aria-hidden="true"
          ><span class="invisible">{line}</span><span class="text-foreground/40">{rest}</span></span
        >
      {/if}
      {#if !shown}
        <span id="{uid}-invite" class="invite pointer-events-none absolute inset-y-0 left-0 flex max-w-full min-w-0 items-center select-none">
          <span class="ghost shrink-0" aria-hidden="true"></span>
          <span class="idle truncate">{invite.idle}</span>
          <span class="ready truncate">{invite.ready}</span>
        </span>
      {/if}
    </span>
    {#if compact}
      <span class="flex shrink-0 items-center">
        <a class={cn(control, "mail")} href="mailto:{PROFILE.email}" aria-label="Email" title={PROFILE.email}><EnvelopeSimpleIcon weight="bold" /></a>
        {@render tour_button()}{@render search_button(true)}
      </span>
    {/if}
  </div>
  {@render completions()}
{/snippet}

{#snippet results()}
  <ul id="{uid}-results" class="flex flex-col" role="listbox" aria-label="Search results">
    {#if found.length === 0 && query.trim()}
      <li class="px-2 py-1 text-foreground/80" role="presentation">No match for "{query.trim()}". Ask me directly:</li>
    {/if}
    {#each hits as hit, index (hit.key)}
      <li role="option" aria-selected={index === selected}>
        <button
          class={cn(
            "grid w-full grid-cols-[8ch_minmax(0,1fr)] items-baseline gap-x-3 rounded-md px-2 py-1 text-left pointer-coarse:py-2.5",
            index === selected ? "bg-primary/12 text-foreground" : "text-foreground hover:bg-foreground/6"
          )}
          onpointerenter={() => (selected = index)}
          onclick={() => jump(index)}
        >
          <span class="text-xs text-foreground/65">{HIT_LABELS[hit.kind]}</span>
          <span class="flex min-w-0 flex-col">
            <span class="min-w-0 break-words">{hit.label}</span>
            {#if hit.detail}<span class="line-clamp-2 min-w-0 text-xs text-foreground/65">{hit.detail}</span>{/if}
          </span>
        </button>
      </li>
    {:else}
      <li class="px-2 py-1 text-foreground/65">Type a company, a project, a skill or a principle.</li>
    {/each}
  </ul>
{/snippet}

{#snippet titlebar()}
  <header class="title flex min-w-0 items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2">
      {#if compact && !session.named}
        <h2 class="min-w-0 truncate font-sans text-ui font-semibold text-foreground">{PROFILE.name}</h2>
      {:else}
        <TerminalWindowIcon class="size-4 shrink-0 text-foreground/80" weight="duotone" />
        <h2 class="min-w-0 truncate font-mono text-ui font-medium text-foreground">{TITLE}</h2>
      {/if}
    </div>
    <nav class="-mr-1 flex shrink-0 items-center gap-0.5 font-sans" aria-label="Contact">
      <a class={button({ variant: "quiet", size: "sm", class: "gap-1.5 px-2 pointer-coarse:h-10 pointer-coarse:px-3" })} href="mailto:{PROFILE.email}" title={PROFILE.email}><EnvelopeSimpleIcon weight="bold" />Email</a>
      {#each socials as social (social.kind)}
        {@const Icon = SOCIAL_ICONS[social.kind]}
        <a class={button({ variant: "quiet", size: "sm", icon: true, class: "pointer-coarse:size-10" })} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.label} title={social.label}><Icon weight="bold" /></a>
      {/each}
    </nav>
  </header>
{/snippet}

{#snippet try_list()}
  <nav class="try pt-1" aria-labelledby="{uid}-try">
    <p id="{uid}-try" class="pb-1 font-sans text-xs font-medium text-foreground/65">Try</p>
    <ul class="-mx-1.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4">
      {#each SUGGESTIONS as suggestion (suggestion.text)}
        {@const command = suggestion.run ?? suggestion.text}
        <li class="contents">
          <button
            class="group col-span-2 grid grid-cols-subgrid items-baseline rounded-md px-1.5 py-1 text-left whitespace-nowrap transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-cottontail"
            title="Run {command}"
            onclick={() => run(command)}
          >
            <span class="text-foreground transition-colors group-hover:text-primary">{suggestion.text}</span>
            <span class="detail min-w-0 truncate font-sans text-xs text-foreground/65">{suggestion.detail}</span>
          </button>
        </li>
      {/each}
    </ul>
  </nav>
{/snippet}

{#if compact}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <section class="terminal compact relative flex flex-col border-b border-foreground/8 font-mono text-ui" style:anchor-name={anchor} class:playing aria-label="Terminal" onclick={claim}>
    <div class="who-row px-4 pt-2 pb-1.5">{@render titlebar()}</div>
    <div class="prompt-row flex min-h-12 flex-col justify-center border-t border-foreground/8 py-1 pr-1 pl-4">{@render prompt()}</div>
    <div class="border-t border-foreground/8 px-4"><TerminalSteps {session} {now} labeled onpick={run} class="gap-3" /></div>
    {#if searching}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="scrim absolute inset-x-0 top-full z-40 h-dvh" onpointerdown={() => (line = "")}></div>
      <div class="absolute inset-x-3 top-full z-50 mt-1.5 max-h-[min(24rem,60cqh)] overflow-y-auto rounded-lg bg-background-lighter p-1 shadow-popover ring-1 ring-foreground/8">{@render results()}</div>
    {/if}
    <div bind:this={sheet} id="{uid}-out" popover="auto" class="sheet m-0 overflow-y-auto overscroll-contain rounded-xl bg-background-lighter p-3 font-mono text-ui text-foreground shadow-popover ring-1 ring-foreground/10" style:position-anchor={anchor} aria-live="polite">
      {#if sheet_entry}{@render entry_view(sheet_entry)}{/if}
    </div>
  </section>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <aside class="terminal panel flex h-full min-h-0 flex-col overflow-hidden font-mono text-ui" class:playing aria-label="Terminal" onclick={claim}>
    <div class="flex h-12 shrink-0 items-center border-b border-foreground/8 pr-2 pl-4">{@render titlebar()}</div>
    <TerminalLive {session} {now} {latest} idle={try_list} />
    <div class={cn("log flex min-h-0 flex-col-reverse overflow-y-auto px-4 pt-3 pb-4", (searching || session.log.length > 0) && "filled")}>
      {#if searching}
        {@render results()}
      {:else}
        <div class="flex flex-col gap-3.5">
          {#each session.log as entry (entry.id)}{@render entry_view(entry)}{/each}
        </div>
      {/if}
    </div>
    <div class="prompt-row flex shrink-0 flex-col gap-1 border-t border-foreground/8 px-4 py-2">{@render prompt()}</div>
    <div class="status-row flex h-11 shrink-0 items-center gap-2 border-t border-foreground/8 pr-2 pl-4 font-mono text-xs text-foreground/65">
      <span class="ml-auto flex shrink-0 items-center">
        {@render tour_button()}
        {#if moved}
          <button class={control} onclick={() => run("tidy")} title="Put windows back"><SquaresFourIcon weight="bold" />tidy</button>
        {/if}
        {@render search_button(false)}
      </span>
    </div>
  </aside>
{/if}

<style>
  .terminal {
    background: var(--portfolio-terminal);
    cursor: text;
  }

  .terminal :is(button, [role="option"]) {
    cursor: default;
  }

  .log {
    flex: 0 1 auto;
    font-size: 0.8125rem;
    color: color-mix(in oklch, var(--foreground) 80%, transparent);
    mask-image: linear-gradient(to bottom, transparent, black 0.75rem);
  }

  /* A fixed share from the first command on, filled from the bottom: a log that grew would push the live panel above
     it up with every line. */
  .log.filled {
    flex: 0 0 45%;
  }

  /* The visitor's caret is a terminal's: a primary block that blinks, steady under reduced motion. `manual` hands the
     blink to the animation, which a keypress restarts so the caret never hides mid-word. */
  .prompt {
    caret-shape: block;
    caret-color: var(--primary);
    text-overflow: ellipsis;
  }

  .prompt:focus {
    animation: caret-blink 1.1s steps(1, end) infinite;
  }

  @keyframes caret-blink {
    50% {
      caret-color: transparent;
    }
  }

  .prompt-line {
    padding-block: 0.125rem;
  }

  .prompt-line:has(.prompt:focus) .caret-mark {
    color: var(--primary);
  }

  /* Not a placeholder: a block caret would sit on its first letter. Unfocused, a hollow block holds the caret's place,
     the way a terminal shows a window without focus; focused, the real caret takes that spot. */
  .invite {
    gap: 1ch;
  }

  .completion {
    font-size: inherit;
    overflow: hidden;
  }

  .suggestions {
    padding-top: 0.25rem;
  }

  .suggestion {
    min-height: 1.75rem;
    color: inherit;
  }

  .suggestion:hover,
  .suggestion.picked {
    background: color-mix(in oklch, var(--foreground) 7%, transparent);
  }

  .suggestion.picked > :first-child {
    color: var(--primary);
  }

  @media (pointer: coarse) {
    .suggestion {
      min-height: 2.5rem;
    }
  }

  .ghost {
    width: 1ch;
    height: 1.2em;
    border-radius: 1px;
    box-shadow: inset 0 0 0 1.5px color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  .invite :is(.idle, .ready) {
    font-size: 0.8125rem;
    color: color-mix(in oklch, var(--foreground) 65%, transparent);
  }

  .prompt:focus ~ .invite .ghost {
    visibility: hidden;
  }

  .prompt:focus ~ .invite .idle,
  .prompt:not(:focus) ~ .invite .ready {
    display: none;
  }

  .playing .ghost {
    box-shadow: inset 0 0 0 1.5px var(--primary);
    animation: ghost-breathe 2.4s ease-in-out infinite;
  }

  .playing .invite .idle {
    color: color-mix(in oklch, var(--foreground) 85%, transparent);
  }

  @keyframes ghost-breathe {
    50% {
      opacity: 0.35;
    }
  }

  .prompt-row {
    transition:
      background-color 200ms var(--ease-out),
      box-shadow 200ms var(--ease-out);
  }

  .prompt-row:has(.prompt:focus) {
    background: color-mix(in oklch, var(--primary) 7%, transparent);
    box-shadow: inset 2px 0 0 var(--primary);
  }

  /* Width only: the column is as tall as what it holds, which size containment would collapse to nothing. */
  .panel {
    container: term / inline-size;
    border-right: 1px solid var(--portfolio-edge);
    transition:
      border-color 200ms var(--ease-out),
      box-shadow 200ms var(--ease-out);
  }

  .panel:has(.prompt:focus) {
    border-right-color: color-mix(in oklch, var(--primary) 55%, transparent);
    box-shadow: inset -1rem 0 1.25rem -1rem color-mix(in oklch, var(--primary) 22%, transparent);
  }

  .compact:has(.prompt:focus) {
    border-bottom-color: color-mix(in oklch, var(--primary) 55%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .prompt:focus,
    .playing .ghost {
      animation: none;
    }
  }

  .key {
    display: inline-grid;
    place-items: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding-inline: 0.25rem;
    border-radius: var(--radius-xs);
    background: color-mix(in oklch, var(--foreground) 8%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: color-mix(in oklch, var(--foreground) 80%, transparent);
  }

  /* Here, not as `pointer-coarse:hidden`: the scoped `display` above outranks the utility. A finger gets the icon. */
  @media (pointer: coarse) {
    .key {
      display: none;
    }
  }

  .mail {
    display: none;
  }

  .sheet {
    position: fixed;
    inset: auto;
    top: anchor(bottom);
    left: anchor(left);
    right: anchor(right);
    /* The popover's own `fit-content` width would ignore the right edge. */
    width: auto;
    margin: 0.375rem 0.75rem 0;
    max-height: min(32rem, 70dvh);
    cursor: auto;
  }

  .sheet:popover-open {
    animation: sheet-in 200ms var(--ease-out) both;
  }

  .sheet::backdrop,
  .scrim {
    background: color-mix(in oklch, var(--background-darkest) 45%, transparent);
  }

  .scrim {
    cursor: default;
  }

  @keyframes sheet-in {
    from {
      opacity: 0;
      translate: 0 -0.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet:popover-open {
      animation: none;
    }
  }

  /* A narrow panel gives each command row two lines, the description under the command, instead of cutting it. */
  @container term (width < 20rem) {
    .try .detail {
      display: none;
    }

    .cols {
      display: flex;
      flex-direction: column;
      white-space: normal;
    }

    .cols-detail {
      font-family: var(--font-sans);
      font-size: 0.75rem;
      line-height: 1rem;
      white-space: normal;
    }
  }

  /* Landscape phones and short windows keep one header row: the title goes, and email moves into the prompt row. */
  @container (height < 30rem) {
    .who-row {
      display: none;
    }

    .mail {
      display: inline-flex;
    }
  }
</style>
