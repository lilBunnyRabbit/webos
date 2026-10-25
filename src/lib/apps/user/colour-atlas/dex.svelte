<script lang="ts">
  import { Badge, Button } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon } from "phosphor-svelte";
  import { TIER_NAMES } from "./atlas";
  import { ATLAS_MODELS, atlas_model, COLLECT_DELTA, format_value, is_playable, route_to_srgb, type Dex } from "./game";
  import { channels_of } from "../color-tools/models";

  interface Props {
    dex: Dex;
    open: string | null;
    onopen: (id: string | null) => void;
    onpractice: (id: string) => void;
  }

  let { dex, open, onopen, onpractice }: Props = $props();

  const page = $derived(open ? atlas_model(open) : null);
  const count = $derived(ATLAS_MODELS.filter((item) => dex[item.id] !== undefined).length);
</script>

{#if page}
  {@const best = dex[page.id]}
  <div class="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col gap-4 overflow-auto p-4">
    <div>
      <Button size="sm" variant="quiet" onclick={() => onopen(null)}><ArrowLeftIcon weight="bold" />Atlas</Button>
    </div>
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold">{page.name}</h2>
        <p class="font-mono text-2xs text-foreground/65">{page.id}</p>
      </div>
      {#if best !== undefined}
        <Badge tone="success">Collected · best ΔE {best.toFixed(2)}</Badge>
      {:else if is_playable(page)}
        <Badge>Not collected yet</Badge>
      {:else}
        <Badge>Not played: byte model</Badge>
      {/if}
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ui">
      <dt class="text-foreground/65">Tier</dt>
      <dd>{TIER_NAMES[page.tier]}</dd>
      <dt class="text-foreground/65">Family</dt>
      <dd>{page.family}</dd>
      <dt class="text-foreground/65">Source</dt>
      <dd>{page.source}</dd>
    </dl>

    <section class="flex flex-col gap-1.5">
      <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Channels</h3>
      <ul class="flex flex-col divide-y divide-foreground/8 rounded-lg bg-background-light ring-1 ring-foreground/8">
        {#each channels_of(page.model) as channel (channel.name)}
          <li class="flex items-baseline justify-between gap-3 px-3 py-2 text-ui">
            <span class="font-mono font-medium">{channel.name}</span>
            <span class="font-mono text-2xs text-foreground/80 tabular-nums">
              {format_value(channel.min)} – {format_value(channel.max)}{channel.hue ? " · hue" : ""}
            </span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="flex flex-col gap-1.5">
      <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Route to sRGB</h3>
      <ol class="flex flex-wrap items-center gap-1.5">
        {#each route_to_srgb(page) as step, index (step.id)}
          {#if index > 0}<li aria-hidden="true"><ArrowRightIcon class="size-3 text-foreground/65" /></li>{/if}
          <li>
            <button
              type="button"
              class="rounded-md bg-foreground/8 px-2 py-1 text-2xs font-medium hover:bg-foreground/12 active:bg-foreground/16 pointer-coarse:py-2"
              onclick={() => onopen(step.id)}
            >
              {step.name}
            </button>
          </li>
        {/each}
      </ol>
    </section>

    {#if is_playable(page)}
      <div class="flex justify-end">
        <Button variant="primary" onclick={() => onpractice(page.id)}>Practice {page.name}</Button>
      </div>
    {/if}
  </div>
{:else}
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3 @xl:p-4">
    <p class="text-2xs text-foreground/65">
      {count} of {ATLAS_MODELS.length} collected. Match a target within ΔE {COLLECT_DELTA} to collect its model.
    </p>
    <ol class="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
      {#each ATLAS_MODELS as item, index (item.id)}
        {@const best = dex[item.id]}
        <li>
          <button
            type="button"
            class={cn(
              "flex h-16 w-full flex-col items-start justify-between rounded-lg p-2 text-left ring-1 ring-foreground/8 hover:opacity-85 active:opacity-70",
              best !== undefined ? "bg-background-light" : "bg-background-darker"
            )}
            aria-label={best !== undefined ? `${item.name}, best ΔE ${best.toFixed(2)}` : is_playable(item) ? `Model ${index + 1}, not collected` : item.name}
            onclick={() => onopen(item.id)}
          >
            <span class="font-mono text-2xs text-foreground/65 tabular-nums">{index + 1}</span>
            {#if best !== undefined}
              <span class="w-full truncate text-2xs font-medium">{item.name}</span>
            {:else if is_playable(item)}
              <span class="text-ui font-semibold text-foreground/65">?</span>
            {:else}
              <span class="w-full truncate text-2xs text-foreground/65">{item.name}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ol>
  </div>
{/if}
