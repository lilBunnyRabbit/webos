<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { Platform, type AppsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { z } from "zod";
  import { Badge, Button, Section } from "$lib/core/components/ui";
  import { ListChecks as ListChecksIcon, Play as PlayIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { run_example_task } from "./task";

  const { count: initial_count }: { count?: number } = $props();

  const { window, storage } = get_app_context();
  // Mobile windows are always fullscreen: no size to show, nothing to maximize or restore (ADR-016).
  const mobile = kernel.platform === Platform.MOBILE;
  const count = storage.persisted("count", untrack(() => initial_count) ?? 0, z.number());
</script>

<div class="mx-auto flex max-w-xl flex-col gap-6 p-4 @md:p-6">
  <header>
    <h1 class="text-lg font-semibold">Example app</h1>
    <p class="text-ui text-foreground/65">A tour of the app context: persisted storage and the window handle.</p>
  </header>

  <Section title="Persisted counter" description="Stored under app.example.count and shared live by every Example window.">
    <div class="flex items-center justify-between gap-4 px-4 py-4">
      <span class="font-mono text-3xl font-semibold tabular-nums">{count.value}</span>
      <div class="flex gap-1.5">
        <Button onclick={() => (count.value = 0)}>Reset</Button>
        <Button variant="primary" onclick={() => count.value++}><PlusIcon weight="bold" /> Increment</Button>
      </div>
    </div>
  </Section>

  <Section title="Background task" description="About 20 s of fake work on the tasks service: parallel downloads, then steps with logs, then packing. It keeps running when this window closes.">
    <div class="flex flex-wrap justify-end gap-1.5 px-4 py-3">
      <Button size="sm" onclick={() => kernel.service<AppsService>("apps").launch("activity-monitor", { section: "tasks" })}><ListChecksIcon weight="bold" /> Show tasks</Button>
      <Button size="sm" onclick={() => run_example_task(true)}>Run, fail once</Button>
      <Button size="sm" variant="primary" onclick={() => run_example_task()}><PlayIcon weight="fill" /> Run</Button>
    </div>
  </Section>

  <Section title="Window">
    <div class="flex items-center justify-between gap-4 px-4 py-2.5">
      <span class="text-ui text-foreground/80">Focused</span>
      <Badge tone={window.is_focused ? "success" : "neutral"}>{window.is_focused ? "yes" : "no"}</Badge>
    </div>
    {#if mobile}
      <div class="flex justify-end gap-1.5 px-4 py-3">
        <Button size="sm" onclick={() => window.minimize()}>Go home</Button>
      </div>
    {:else}
      <div class="flex items-center justify-between gap-4 px-4 py-2.5">
        <span class="text-ui text-foreground/80">Size</span>
        <span class="font-mono text-2xs tabular-nums">{window.bounds.width} × {window.bounds.height}</span>
      </div>
      <div class="flex justify-end gap-1.5 px-4 py-3">
        <Button size="sm" onclick={() => window.restore()}>Restore</Button>
        <Button size="sm" onclick={() => window.maximize()}>Maximize</Button>
      </div>
    {/if}
  </Section>
</div>
