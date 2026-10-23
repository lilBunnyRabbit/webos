<script lang="ts">
  import { Badge } from "$lib/core/components/ui";
  import type { Component } from "svelte";
  import type { PlatformReport } from "./checks";
  import type { PageMeta } from "./parse";
  import type { CardProps } from "./preview-cards";
  import PreviewDiscord from "./preview-discord.svelte";
  import PreviewFacebook from "./preview-facebook.svelte";
  import PreviewImessage from "./preview-imessage.svelte";
  import PreviewLinkedin from "./preview-linkedin.svelte";
  import PreviewSlack from "./preview-slack.svelte";
  import PreviewTwitter from "./preview-twitter.svelte";
  import { PLATFORMS, type Platform } from "./platforms";
  import { PLATFORM_ICONS, verdict } from "./verdict";

  interface Props {
    meta: PageMeta;
    reports: PlatformReport[];
    onselect: (platform: Platform) => void;
  }

  const { meta, reports, onselect }: Props = $props();

  const CARDS: Record<Platform, Component<CardProps>> = {
    slack: PreviewSlack,
    twitter: PreviewTwitter,
    facebook: PreviewFacebook,
    discord: PreviewDiscord,
    linkedin: PreviewLinkedin,
    imessage: PreviewImessage,
  };
</script>

<div class="grid gap-3 @3xl:grid-cols-2">
  {#each reports as report (report.id)}
    {@const Card = CARDS[report.id]}
    {@const Icon = PLATFORM_ICONS[report.id]}
    {@const result = verdict(report)}
    <section aria-label={PLATFORMS[report.id].name} class="flex min-w-0 flex-col gap-3 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline">
      <header class="flex items-center gap-2">
        <span class="grid size-6 shrink-0 place-items-center rounded-md bg-foreground/8 text-foreground/80"><Icon class="size-3.5" weight="bold" /></span>
        <h3 class="min-w-0 flex-1 truncate text-ui font-medium">{PLATFORMS[report.id].name}</h3>
        <button type="button" class="-my-1.5 grid min-h-8 place-items-center rounded-sm hover:opacity-85 active:opacity-70 pointer-coarse:-my-2.5 pointer-coarse:min-h-11" title="Show the checks" onclick={() => onselect(report.id)}>
          <Badge tone={result.tone}>{result.label}</Badge>
        </button>
      </header>
      <Card {meta} />
    </section>
  {/each}
</div>
