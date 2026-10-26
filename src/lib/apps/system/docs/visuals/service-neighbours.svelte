<script lang="ts">
  import { Badge } from "$lib/core/components/ui";
  import { ArrowRight as ArrowRightIcon } from "phosphor-svelte";
  import { is_swapped, service_graph } from "../graph";
  import { live_services, service_page } from "../live";
  import { has_page } from "../pages";

  interface Props {
    service: string;
    onopen: (id: string) => void;
  }

  let { service, onopen }: Props = $props();

  const graph = $derived(service_graph(live_services()));
  const node = $derived(graph.nodes.find((item) => item.key === service));
</script>

{#snippet chips(keys: readonly string[], empty: string)}
  {#if keys.length === 0}
    <span class="text-2xs text-foreground/65">{empty}</span>
  {:else}
    <div class="flex flex-wrap gap-1.5">
      {#each keys as key (key)}
        <button
          class="inline-flex h-7 items-center rounded-md bg-background px-2 font-mono text-2xs ring-1 ring-foreground/12 transition-colors hover:bg-foreground/6 disabled:opacity-60 pointer-coarse:h-9"
          disabled={!has_page(service_page(key))}
          onclick={() => onopen(service_page(key))}>{key}</button
        >
      {/each}
    </div>
  {/if}
{/snippet}

{#if node}
  <section class="grid gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8 @lg:grid-cols-[1fr_auto_auto_auto_1fr] @lg:items-center" aria-label="Where {service} sits">
    <div class="flex flex-col gap-1.5">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Needs</span>
      {@render chips(node.dependencies, "Nothing: starts first")}
    </div>
    <ArrowRightIcon class="hidden size-4 text-foreground/40 @lg:block" weight="bold" />
    <div class="flex flex-col gap-1 rounded-lg bg-primary/10 px-3 py-2 ring-1 ring-primary/30">
      <span class="text-ui font-semibold">{node.key}</span>
      <span class="font-mono text-2xs text-foreground/80">{node.name}</span>
      <span class="flex flex-wrap gap-1">
        <Badge tone="neutral">starts {node.order} of {graph.nodes.length}</Badge>
        {#if is_swapped(node)}<Badge tone="info">swapped here</Badge>{/if}
      </span>
    </div>
    <ArrowRightIcon class="hidden size-4 text-foreground/40 @lg:block" weight="bold" />
    <div class="flex flex-col gap-1.5">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Needed by</span>
      {@render chips(node.dependents, "No other service")}
    </div>
  </section>
{:else}
  <p class="rounded-xl bg-background-light px-3 py-2 text-ui text-foreground/80 ring-1 ring-foreground/8">
    <span class="font-mono">{service}</span> isn't running on this device.
  </p>
{/if}
