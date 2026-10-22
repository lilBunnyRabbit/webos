<script lang="ts">
  import { AppIcon } from "$lib/core/components/ui";
  import type { AppManifest, DialogProps } from "$lib/core/api";
  import { ClockCounterClockwise as ClockCounterClockwiseIcon } from "phosphor-svelte";
  import { Button } from "../ui";

  interface Props extends DialogProps<boolean> {
    /** One entry per saved window, oldest first; `null` for an app that no longer exists. */
    apps: (AppManifest | null)[];
  }

  let { apps, resolve }: Props = $props();

  const known = $derived(apps.filter((app): app is AppManifest => app !== null));
  const missing = $derived(apps.length - known.length);
</script>

<div class="grid w-96 max-w-[calc(100vw-2rem)] animate-pop-in gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover">
  <div class="flex items-start gap-3">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
      <ClockCounterClockwiseIcon class="size-5" weight="bold" />
    </span>
    <div>
      <h2 class="text-sm font-semibold">Pick up where you left off?</h2>
      <p class="text-ui text-foreground/65">
        {apps.length} {apps.length === 1 ? "window was" : "windows were"} open when WebOS last closed.
      </p>
    </div>
  </div>

  <ul class="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded-xl bg-background-darker p-1.5 ring-1 ring-inset ring-foreground/8">
    {#each known as app, index (index)}
      <li class="flex h-8 items-center gap-2.5 rounded-lg px-2 text-ui">
        <AppIcon src={app.icon} class="size-4 shrink-0 text-foreground/80" />
        <span class="truncate">{app.name}</span>
      </li>
    {/each}
    {#if missing > 0}
      <li class="flex h-8 items-center px-2 text-ui text-foreground/65">+{missing} from apps that no longer exist</li>
    {/if}
  </ul>

  <div class="flex justify-end gap-2">
    <Button variant="quiet" onclick={() => resolve(false)}>Start fresh</Button>
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant="primary" autofocus onclick={() => resolve(true)}>Restore windows</Button>
  </div>
</div>
