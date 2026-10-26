<script lang="ts">
  import kernel, { type AppsService, type InspectorProps } from "$lib/core/api";
  import { has_page } from "../docs/pages";
  import LogoMark from "$lib/core/components/brand/logo-mark.svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn, error_message } from "$lib/core/utils";
  import type { Component } from "svelte";
  import { z } from "zod";
  import { Badge, Button } from "$lib/core/components/ui";
  import {
    ArrowsInSimple as ArrowsInSimpleIcon,
    ArrowsOutSimple as ArrowsOutSimpleIcon,
    BookOpenText as BookOpenTextIcon,
    CaretRight as CaretRightIcon,
  } from "phosphor-svelte";

  const { storage } = get_app_context();
  const expanded = storage.window("expanded", [] as string[], z.array(z.string()));

  const services = $derived([...kernel.services.entries()]);
  const apps = $derived(kernel.service<AppsService>("apps"));
  const all_expanded = $derived(services.length > 0 && services.every(([key]) => expanded.value.includes(key)));

  function toggle(key: string) {
    expanded.value = expanded.value.includes(key) ? expanded.value.filter((item) => item !== key) : [...expanded.value, key];
  }

  function toggle_all() {
    expanded.value = all_expanded ? [] : services.map(([key]) => key);
  }
</script>

<div class="mx-auto flex min-h-full max-w-4xl flex-col gap-5 p-6">
  <header class="flex items-center gap-3">
    <LogoMark class="h-8 w-auto text-primary" />
    <div class="flex-1">
      <h1 class="text-lg leading-tight font-semibold">Kernel</h1>
      <p class="text-ui text-foreground/65">{services.length} services, in init order</p>
    </div>
    <Button size="sm" variant="quiet" onclick={toggle_all} aria-pressed={all_expanded}>
      {#if all_expanded}
        <ArrowsInSimpleIcon weight="bold" /> Collapse all
      {:else}
        <ArrowsOutSimpleIcon weight="bold" /> Expand all
      {/if}
    </Button>
  </header>

  <ul class="flex flex-col gap-2">
    {#each services as [key, service] (key)}
      {@const open = expanded.value.includes(key)}
      <li class="rounded-xl bg-background-light ring-1 ring-foreground/8">
        <button
          class="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-foreground/4"
          aria-expanded={open}
          aria-controls="inspector-{key}"
          onclick={() => toggle(key)}
        >
          <CaretRightIcon class={cn("size-4 shrink-0 text-foreground/65 transition-transform", open && "rotate-90")} />
          <span class="text-ui font-semibold">{service.name}</span>
          <Badge>{key}</Badge>
          <span class="ml-auto hidden truncate text-2xs text-foreground/80 @lg:block">{service.description}</span>
        </button>

        <div id="inspector-{key}" class="flex flex-col gap-3 px-3 pb-3 pl-9">
          {#if service.inspector}
            {#await service.inspector() then { default: inspector }}
              <!-- The kernel registers each service under its own key, so the service matches the inspector it ships. -->
              {@const View = inspector as Component<InspectorProps>}
              <View {service} detailed={open} />
            {:catch error}
              <p class="text-sm text-error">Inspector failed to load: {error_message(error)}</p>
            {/await}
          {:else}
            <pre class="overflow-x-auto font-mono text-sm text-foreground/80">{service.to_string()}</pre>
          {/if}
          {#if has_page(`system/services/${key}`)}
            <Button size="sm" variant="quiet" class="self-start" onclick={() => apps.launch("docs", { page: `system/services/${key}` })}>
              <BookOpenTextIcon weight="bold" /> Open docs
            </Button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
</div>
