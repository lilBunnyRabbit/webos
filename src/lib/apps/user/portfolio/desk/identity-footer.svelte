<script lang="ts">
  import { button } from "$lib/core/components/ui";
  import { EnvelopeSimple as EnvelopeSimpleIcon } from "phosphor-svelte";
  import { PROFILE } from "../content/profile";
  import { Publication, SocialKind } from "../content/types";
  import DraftMark from "../draft-mark.svelte";
  import { SOCIAL_ICONS } from "../social-icon";
  import { COMMAND_OF, Win } from "./script";
  import type { PortfolioSession } from "./session.svelte";

  let { session }: { session: PortfolioSession } = $props();

  const FIRST: string[] = [SocialKind.LINKEDIN, SocialKind.GITHUB, SocialKind.X];
  const socials = [...PROFILE.socials]
    .sort((a, b) => Number(!FIRST.includes(a.kind)) - Number(!FIRST.includes(b.kind)));
  const drafted = socials.some((social) => social.status !== Publication.OK);
  const icon = button({ variant: "quiet", size: "sm", icon: true, class: "text-foreground/80 hover:text-foreground pointer-coarse:size-10" });

  // Email is the Contact window's composer, which writes the message before the mail app opens.
  function email() {
    session.pause();
    session.submit(COMMAND_OF[Win.CONTACT]);
  }
</script>

<footer class="status shrink-0 border-t border-foreground/8">
  <div class="row py-1">
  <nav class="links flex items-center justify-between gap-0.5 px-2" aria-label="Elsewhere">
    <button class={icon} aria-label="Email" title="Email" onclick={email}><EnvelopeSimpleIcon weight="bold" /></button>
    {#each socials as social (social.kind)}
      {@const Icon = SOCIAL_ICONS[social.kind]}
      <a class={icon} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.label} title={social.label}><Icon weight="bold" /></a>
    {/each}
    {#if drafted}<span class="pr-1"><DraftMark status={Publication.DRAFT} /></span>{/if}
  </nav>
  </div>
</footer>

<style>
  .status {
    container: status / inline-size;
    background: var(--portfolio-bar);
  }

  @container status (width >= 40rem) {
    .links {
      justify-content: flex-start;
    }
  }

  @property --fade-end {
    syntax: "<length>";
    inherits: false;
    initial-value: 0px;
  }

  .links {
    overflow-x: auto;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }

  @supports (animation-timeline: scroll()) {
    .links {
      mask-image: linear-gradient(to right, black calc(100% - var(--fade-end)), transparent);
      animation: links-fade linear both;
      animation-timeline: scroll(self inline);
    }
  }

  @keyframes links-fade {
    0%,
    92% {
      --fade-end: 1.75rem;
    }
    100% {
      --fade-end: 0px;
    }
  }

  .links > :global(*) {
    flex-shrink: 0;
  }
</style>
