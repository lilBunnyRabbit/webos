<script lang="ts">
  import type { AppManifest, DialogProps } from "$lib/core/api";
  import { ClockCounterClockwise as ClockCounterClockwiseIcon } from "phosphor-svelte";

  interface Props extends DialogProps<boolean> {
    /** One entry per saved window, oldest first; `null` for an app that no longer exists. */
    apps: (AppManifest | null)[];
  }

  let { apps, resolve }: Props = $props();

  const known = $derived(apps.filter((app): app is AppManifest => app !== null));
  const missing = $derived(apps.length - known.length);
</script>

<div class="grid w-80 max-w-[calc(100vw-2rem)] gap-3 rounded-md border border-foreground/20 bg-background p-4 text-sm shadow-window">
  <div class="flex items-center gap-2">
    <ClockCounterClockwiseIcon class="size-5 text-primary" />
    <h2 class="font-semibold">Restore last session?</h2>
  </div>

  <p class="text-foreground/70">
    {apps.length} {apps.length === 1 ? "window was" : "windows were"} open when WebOS last closed.
  </p>

  <ul class="flex max-h-40 flex-col gap-1 overflow-y-auto">
    {#each known as app, index (index)}
      <li class="flex items-center gap-2">
        <app.icon class="size-4 shrink-0" />
        <span class="truncate">{app.name}</span>
      </li>
    {/each}
    {#if missing > 0}
      <li class="text-foreground/50">{missing} from apps that no longer exist</li>
    {/if}
  </ul>

  <div class="flex justify-end gap-2 pt-1">
    <button class="rounded-sm px-3 py-1.5 hover:bg-foreground/10" onclick={() => resolve(false)}>Start fresh</button>
    <!-- svelte-ignore a11y_autofocus -->
    <button
      class="rounded-sm bg-primary px-3 py-1.5 font-medium text-background hover:bg-primary/90"
      autofocus
      onclick={() => resolve(true)}
    >
      Restore
    </button>
  </div>
</div>
