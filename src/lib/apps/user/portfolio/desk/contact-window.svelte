<script lang="ts">
  import kernel, { NotificationType, type ClipboardService, type NotificationsService } from "$lib/core/api";
  import { button, IconButton, Input, Kbd, Textarea } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { motion_reduced } from "$lib/core/utils/motion";
  import { Check as CheckIcon, Clock as ClockIcon, Command as CommandIcon, Copy as CopyIcon, EnvelopeSimple as EnvelopeSimpleIcon } from "phosphor-svelte";
  import { shape_for } from "../particles/glyphs";
  import { PROFILE } from "../content/profile";
  import { SocialKind } from "../content/types";
  import DraftMark from "../draft-mark.svelte";
  import { SOCIAL_ICONS } from "../social-icon";
  import { clock, HOME, mailto, until_next_minute } from "./contact";
  import { on_primary } from "./ink.svelte";
  import ParticleFigure from "../particles/figure.svelte";
  import type { PortfolioSession } from "./session.svelte";
  import Unbroken from "./unbroken.svelte";

  let { session, ready }: { session: PortfolioSession; ready: boolean } = $props();

  const LOGO = shape_for(null);
  const SHOWN: string[] = [SocialKind.LINKEDIN, SocialKind.GITHUB, SocialKind.X];
  const socials = PROFILE.socials.filter((social) => SHOWN.includes(social.kind));
  const MAC = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const ink = on_primary();
  const uid = $props.id();
  const still = motion_reduced();
  const { app_id } = get_app_context();
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let now = $state(new Date());
  let send: HTMLAnchorElement | null = $state(null);
  let subject: HTMLInputElement | null = $state(null);
  let message: HTMLTextAreaElement | null = $state(null);
  let card: HTMLElement | null = $state(null);
  let pane: HTMLCanvasElement | null = $state(null);
  let flights = $state(0);
  let opening = $state(false);
  let copied = $state(false);
  let opening_timer: ReturnType<typeof setTimeout> | undefined;
  let copied_timer: ReturnType<typeof setTimeout> | undefined;

  const href = $derived(mailto(PROFILE.email, { subject: session.subject, message: session.message }));

  $effect(() => {
    let timer = setTimeout(function tick() {
      now = new Date();
      timer = setTimeout(tick, until_next_minute(now));
    }, until_next_minute(new Date()));
    return () => clearTimeout(timer);
  });

  $effect(() => () => {
    clearTimeout(opening_timer);
    clearTimeout(copied_timer);
  });

  function sent() {
    if (!still) flights++;
    opening = true;
    clearTimeout(opening_timer);
    opening_timer = setTimeout(() => (opening = false), 2600);
  }

  // The row says "Copied" out loud, so it waits for the copy to succeed; a failure is reported the way the kit's copy button does.
  async function copy_email() {
    try {
      await clipboard.copy_text(PROFILE.email);
    } catch (reason) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't copy to the clipboard", message: error_message(reason) });
      return;
    }
    copied = true;
    clearTimeout(copied_timer);
    copied_timer = setTimeout(() => (copied = false), 1600);
  }

  // Enter in the subject goes on to the message, the way a mail app's does; only Mod+Enter sends.
  function keydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.isComposing) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      send?.click();
    } else if (event.target === subject) {
      event.preventDefault();
      message?.focus();
    }
  }
</script>

<div class="contact">
  <section bind:this={card} class="card" aria-labelledby="{uid}-name">
    {#if !still}<canvas bind:this={pane} class="pane" aria-hidden="true"></canvas>{/if}
    <div class="lead">
      <ParticleFigure shape={LOGO} {ready} swarm surface={{ stage: card, canvas: pane }} class="figure" />
    </div>
    <div class="who">
      <p id="{uid}-name" class="name font-semibold text-foreground">{PROFILE.name}</p>
      <p class="role mt-0.5 text-ui text-foreground/80"><Unbroken text={PROFILE.role} /></p>
    </div>
    <ul class="facts flex flex-col gap-1.5 text-ui">
      <li class="flex items-center gap-2 text-foreground/80">
        <ClockIcon class="size-3.5 shrink-0 text-foreground/65" weight="bold" />
        <span><time class="font-medium text-foreground tabular-nums" datetime={now.toISOString()}>{clock(now)}</time> in {HOME}</span>
      </li>
    </ul>
    <ul class="socials" aria-label="Elsewhere">
      {#each socials as social (social.kind)}
        {@const Icon = SOCIAL_ICONS[social.kind]}
        <li>
          <a class="social" href={social.url} target="_blank" rel="noopener noreferrer">
            <Icon class="size-4 shrink-0" weight="bold" />
            <span class="truncate">{social.label}</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <form
    class="composer"
    aria-label="Write me an email"
    onsubmit={(event) => event.preventDefault()}
    onkeydown={keydown}
  >
    <div class="fields">
      <span class="key" id="{uid}-to">To</span>
      <div class="to flex min-w-0 items-center gap-1" aria-labelledby="{uid}-to" role="group">
        <span class="min-w-0 truncate font-mono text-ui text-foreground select-all">{PROFILE.email}</span>
        <span class="copied text-xs font-medium text-success" class:on={copied} aria-live="polite">{copied ? "Copied" : ""}</span>
        <IconButton label={copied ? "Copied" : "Copy email address"} size="sm" class="ml-auto shrink-0 text-foreground/80 pointer-coarse:size-10" onclick={copy_email}>
          {#if copied}<CheckIcon weight="bold" class="text-success" />{:else}<CopyIcon weight="bold" />{/if}
        </IconButton>
      </div>

      <label class="key" for="{uid}-subject">Subject</label>
      <Input id="{uid}-subject" bind:element={subject} bind:value={session.subject} enterkeyhint="next" placeholder="A role, a project, or just hello" autocomplete="off" maxlength={140} />
    </div>

    <label class="sr-only" for="{uid}-message">Message</label>
    <Textarea id="{uid}-message" bind:element={message} bind:value={session.message} rows={5} class="message" placeholder="What you're building, and where I might fit in." />

    <div class="foot flex items-center justify-end gap-3">
      <p class="hint mr-auto min-w-0 text-xs text-foreground/65" aria-live="polite">
        {#if opening}
          Opening your mail app
        {:else}
          <span class="keys"><Kbd>{#if MAC}<CommandIcon class="size-3" weight="bold" aria-label="Command" />{:else}Ctrl{/if}</Kbd><Kbd>Enter</Kbd></span> opens it in your mail app
        {/if}
      </p>
      <a bind:this={send} {href} class={button({ variant: "primary", size: "md", class: `send h-10 shrink-0 overflow-hidden px-4 ${ink.value}` })} onclick={sent}>
        {#key flights}<span class={["plane grid", flights > 0 && "fly"]}><EnvelopeSimpleIcon weight="bold" /></span>{/key}Send
      </a>
    </div>
  </form>

  <footer class="bar border-t border-foreground/8 px-3.5 py-2">
    <p class="flex min-w-0 items-start gap-2 text-xs leading-snug text-foreground">
      <span class="live mt-[0.3125rem]" aria-hidden="true"></span>
      <span class="text-pretty"><Unbroken text={PROFILE.availability.text} /> <DraftMark status={PROFILE.availability.status} /></span>
    </p>
  </footer>
</div>

<style>
  .contact {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 100%;
  }

  .card {
    display: grid;
    grid-template: "lead who" auto "facts facts" auto "socials socials" auto / 4.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.875rem 1rem;
    padding: 1.125rem 1.25rem 1rem;
    background: var(--portfolio-inset);
    border-bottom: 1px solid var(--portfolio-edge);
  }

  .card {
    position: relative;
    isolation: isolate;
  }

  .card > :not(.pane) {
    position: relative;
    z-index: 1;
  }

  /* The swarm has the whole pane to fly in, but only the logo's slot at full strength: dots that pass behind the text
     are faint, so the name and the facts stay readable while it forms. */
  .pane {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0;
    transition: opacity 420ms var(--ease-out);
    mask-image: radial-gradient(calc(var(--fw, 6rem) * 0.66) calc(var(--fh, 6rem) * 0.66) at var(--fx, 50%) var(--fy, 4rem), black 80%, rgb(0 0 0 / 0.22) 100%);
  }

  .pane:global(.lit:not(.away)) {
    opacity: 1;
  }

  .lead {
    grid-area: lead;
    display: grid;
    height: 4.5rem;
  }

  .lead > :global(.figure) {
    min-height: 0;
  }

  .who {
    grid-area: who;
    min-width: 0;
  }

  .facts {
    grid-area: facts;
  }

  .socials {
    grid-area: socials;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-left: -0.375rem;
  }

  .name {
    font-size: 1.1875rem;
    line-height: 1.15;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  .role {
    line-height: 1.35;
    text-wrap: balance;
  }

  .live {
    position: relative;
    flex-shrink: 0;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--success);
  }

  .live::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--success);
    animation: ping 2.4s var(--ease-out) infinite;
  }

  @keyframes ping {
    0% {
      opacity: 0.55;
      scale: 1;
    }
    70%,
    100% {
      opacity: 0;
      scale: 2.6;
    }
  }

  .socials > li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .social {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    height: 2rem;
    padding-inline: 0.375rem;
    border-radius: var(--radius-md);
    color: color-mix(in oklch, var(--foreground) 80%, transparent);
    font-size: var(--text-ui);
    transition:
      background-color 150ms,
      color 150ms;
  }

  .social:hover,
  .social:focus-visible {
    background: color-mix(in oklch, var(--foreground) 7%, transparent);
    color: var(--foreground);
  }

  .social:focus-visible {
    outline: 2px solid var(--cottontail);
    outline-offset: 1px;
  }

  @media (pointer: coarse) {
    .social {
      height: 2.5rem;
      padding-inline: 0.625rem;
    }
  }

  .composer {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    min-width: 0;
    padding: 1.125rem 1.25rem 1.25rem;
  }

  .fields {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem 0.875rem;
  }

  .key {
    font-size: var(--text-xs);
    color: color-mix(in oklch, var(--foreground) 65%, transparent);
  }

  .to {
    min-height: 2rem;
    padding-left: 0.625rem;
  }

  .copied {
    opacity: 0;
    translate: -0.25rem 0;
    transition:
      opacity 160ms,
      translate 200ms var(--ease-out);
  }

  .copied.on {
    opacity: 1;
    translate: 0 0;
  }

  .composer :global(.message) {
    flex: 1 0 auto;
    min-height: 7.5rem;
    resize: none;
  }

  .keys {
    display: inline-flex;
    gap: 0.125rem;
    margin-right: 0.25rem;
    vertical-align: -0.125rem;
  }

  @media (pointer: coarse) {
    .hint {
      visibility: hidden;
    }
  }

  .plane.fly {
    animation: fly 700ms var(--ease-in-out) both;
  }

  @keyframes fly {
    0% {
      translate: 0 0;
      rotate: 0deg;
      opacity: 1;
    }
    40% {
      translate: 1.5rem -1.1rem;
      rotate: -14deg;
      opacity: 0;
    }
    41% {
      translate: -1.25rem 0;
      rotate: 0deg;
      opacity: 0;
    }
    100% {
      translate: 0 0;
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live::after,
    .plane.fly {
      animation: none;
    }

    .social,
    .copied {
      transition: none;
    }
  }

  .bar {
    grid-column: 1 / -1;
    background: var(--portfolio-bar);
  }

  @container win (width >= 40rem) {
    .contact {
      grid-template-columns: 16.25rem minmax(0, 1fr);
    }

    .card {
      grid-template: "lead" auto "who" auto "facts" auto "socials" 1fr / minmax(0, 1fr);
      align-content: start;
      align-items: start;
      gap: 0.875rem;
      padding: 1.25rem 1.25rem 1.125rem;
      border-bottom: 0;
      border-right: 1px solid var(--portfolio-edge);
    }

    .lead {
      height: 7.5rem;
      margin-bottom: 0.25rem;
    }

    .socials {
      align-self: end;
    }

    .composer {
      padding: 1.25rem 1.375rem 1.25rem;
    }
  }
</style>
