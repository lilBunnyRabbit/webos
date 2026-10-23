<script lang="ts">
  import { Badge, Button, CopyButton, EmptyState } from "$lib/core/components/ui";
  import { FileArrowUp as FileArrowUpIcon, FolderOpen as FolderOpenIcon } from "phosphor-svelte";
  import type { Craft } from "./craft";

  interface Props {
    craft: Craft | null;
    source_name: string | null;
    notes: string[];
    onpick: () => void;
    onopen: () => void;
  }

  let { craft, source_name, notes, onpick, onopen }: Props = $props();
</script>

<div class="flex flex-col gap-3 p-3">
  {#if !craft}
    <EmptyState
      icon={FileArrowUpIcon}
      title="Import a craft"
      description="Open a SimplePlanes aircraft save (.xml) to list its setters and part inputs and turn them into code. On a Mac they're in ~/Library/Application Support/unity.Jundroo.SimplePlanes/AircraftDesigns."
    >
      {#snippet actions()}
        <Button variant="primary" onclick={onpick}><FolderOpenIcon weight="bold" /> Open a craft…</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-sm font-medium">{craft.name || source_name || "Craft"}</h3>
        <p class="font-mono text-2xs text-foreground/65">{craft.setters.length} setters · {craft.inputs.length} part inputs</p>
      </div>
      <Button size="sm" onclick={onpick}>Another…</Button>
      <Button size="sm" variant="primary" onclick={onopen}>Open as code</Button>
    </div>

    {#if notes.length}
      <ul class="flex flex-col gap-1 rounded-lg bg-warning/10 p-2.5 text-2xs">
        {#each notes as note (note)}<li>{note}</li>{/each}
      </ul>
    {/if}

    <section aria-label="Setters" class="flex flex-col gap-1.5">
      <h4 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Setters, top to bottom</h4>
      {#each craft.setters as setter, index (index)}
        <div class="flex items-start gap-2 rounded-lg bg-background-light p-2.5 shadow-card ring-1 ring-hairline">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-2 font-mono text-ui font-medium">
              {setter.variable}
              {#if setter.priority !== 0}<Badge tone="warning">priority {setter.priority}</Badge>{/if}
              {#if setter.activator}<Badge tone="warning">activator</Badge>{/if}
            </span>
            <code class="font-mono text-2xs break-all text-foreground/80 select-text">{setter.function}</code>
          </div>
          <CopyButton text={setter.function} label="Copy {setter.variable}" />
        </div>
      {:else}
        <p class="text-ui text-foreground/65">No setters.</p>
      {/each}
    </section>

    <section aria-label="Part inputs" class="flex flex-col gap-1.5">
      <h4 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Part inputs</h4>
      {#each craft.inputs as input, index (index)}
        <div class="flex items-start gap-2 rounded-lg bg-background-light p-2.5 shadow-card ring-1 ring-hairline">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="truncate text-ui"><span class="font-mono">{input.part_type}</span> <span class="text-foreground/65">#{input.part_id} · {input.attribute}</span></span>
            <code class="font-mono text-2xs break-all text-foreground/80 select-text">{input.value}</code>
          </div>
          <CopyButton text={input.value} label="Copy part {input.part_id} {input.attribute}" />
        </div>
      {:else}
        <p class="text-ui text-foreground/65">No part uses Funky Trees.</p>
      {/each}
    </section>
  {/if}
</div>
