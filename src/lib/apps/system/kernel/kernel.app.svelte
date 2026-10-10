<script lang="ts">
  import kernel, { type InspectorProps } from "$lib/core/api";
  import LogoMark from "$lib/core/components/brand/logo-mark.svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import type { Component } from "svelte";
  import { z } from "zod";
  import {
    ArrowsInSimple as ArrowsInSimpleIcon,
    ArrowsOutSimple as ArrowsOutSimpleIcon,
    CaretRight as CaretRightIcon,
  } from "phosphor-svelte";

  const { storage } = get_app_context();
  const expanded = storage.persisted("expanded", [] as string[], z.array(z.string()));

  const services = $derived([...kernel.services.entries()]);
  const all_expanded = $derived(services.length > 0 && services.every(([key]) => expanded.value.includes(key)));

  function toggle(key: string) {
    expanded.value = expanded.value.includes(key) ? expanded.value.filter((item) => item !== key) : [...expanded.value, key];
  }

  function toggle_all() {
    expanded.value = all_expanded ? [] : services.map(([key]) => key);
  }
</script>

<div class="flex min-h-full flex-col gap-4 p-4">
  <header class="flex items-center gap-3">
    <LogoMark class="h-8 w-auto text-primary" />
    <div class="flex-1">
      <h1 class="text-xl font-semibold leading-tight">Kernel</h1>
      <p class="text-xs text-foreground/50">{services.length} services, in init order</p>
    </div>
    <button
      class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm hover:bg-foreground/10"
      onclick={toggle_all}
      aria-pressed={all_expanded}
    >
      {#if all_expanded}
        <ArrowsInSimpleIcon class="size-4" /> Collapse all
      {:else}
        <ArrowsOutSimpleIcon class="size-4" /> Expand all
      {/if}
    </button>
  </header>

  <ul class="flex flex-col gap-2">
    {#each services as [key, service] (key)}
      {@const open = expanded.value.includes(key)}
      <li class="rounded-sm border border-foreground/15 bg-foreground/[0.03]">
        <button
          class="flex w-full items-center gap-2 rounded-t-sm px-3 py-2 text-left hover:bg-foreground/5"
          aria-expanded={open}
          aria-controls="inspector-{key}"
          onclick={() => toggle(key)}
        >
          <CaretRightIcon class={cn("size-4 shrink-0 text-foreground/60 transition-transform", open && "rotate-90")} />
          <span class="font-semibold">{service.name}</span>
          <span class="font-mono text-xs text-foreground/50">{key}</span>
          <span class="ml-auto truncate text-xs text-foreground/50">{service.description}</span>
        </button>

        <div id="inspector-{key}" class="flex flex-col gap-3 px-3 pb-3 pl-9">
          {#if service.inspector}
            {#await service.inspector() then { default: inspector }}
              <!-- The kernel registers each service under its own key, so the service matches the inspector it ships. -->
              {@const View = inspector as Component<InspectorProps>}
              <View {service} detailed={open} />
            {:catch error}
              <p class="text-sm text-error">Inspector failed to load: {error instanceof Error ? error.message : String(error)}</p>
            {/await}
          {:else}
            <pre class="overflow-x-auto font-mono text-sm text-foreground/70">{service.to_string()}</pre>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</div>
