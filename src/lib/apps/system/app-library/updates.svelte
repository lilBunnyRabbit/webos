<script lang="ts">
  import kernel, { type AppListing, type StoreService } from "$lib/core/api";
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { format_date } from "$lib/core/utils";
  import { ArrowsClockwise as ArrowsClockwiseIcon, CheckCircle as CheckCircleIcon } from "phosphor-svelte";
  import type { AppUpdate } from "./discover";
  import StoreRow from "./store-row.svelte";

  interface Props {
    waiting: AppListing[];
    recent: AppUpdate[];
    onselect: (manifest: AppListing) => void;
  }

  let { waiting, recent, onselect }: Props = $props();

  const store = $derived(kernel.service<StoreService>("store"));
  const day = (date: string) => format_date(new Date(`${date}T00:00`));
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-5 pb-8 @2xl:px-8 @2xl:pt-7">
  <header>
    <h2 class="text-lg font-semibold">Updates</h2>
    <p class="text-2xs text-foreground/80">Installed apps update on their own after every release, then work offline.</p>
  </header>

  <section class="flex flex-col gap-2" aria-labelledby="updates-waiting">
    <div class="flex flex-wrap items-center gap-2">
      <h3 id="updates-waiting" class="min-w-0 flex-1 text-sm font-semibold">
        {waiting.length ? `Waiting to download · ${waiting.length}` : "Waiting to download"}
      </h3>
      {#if waiting.length}
        {#if store.syncing}
          <span class="flex items-center gap-1.5 text-2xs text-foreground/80"><Spinner label="Updating" /> Updating…</span>
        {:else}
          <Button size="sm" variant="primary" disabled={!store.online} onclick={() => void store.sync()}>
            <ArrowsClockwiseIcon weight="bold" /> Update all
          </Button>
        {/if}
      {/if}
    </div>
    {#if waiting.length === 0}
      <EmptyState icon={CheckCircleIcon} title="Everything is up to date" description="Every installed app has this release's files and works offline." class="py-6" />
    {:else}
      {#if !store.online}<p class="text-2xs text-foreground/80">Offline: they download when the connection is back.</p>{/if}
      <ul class="flex flex-col">
        {#each waiting as manifest (manifest.id)}
          <StoreRow {manifest} {onselect}>
            {#snippet detail()}<span class="font-mono">{manifest.version}</span> · not on this device yet{/snippet}
          </StoreRow>
        {/each}
      </ul>
    {/if}
  </section>

  {#if recent.length}
    <section class="flex flex-col gap-2" aria-labelledby="updates-recent">
      <h3 id="updates-recent" class="text-sm font-semibold">Recently updated</h3>
      <ul class="flex flex-col">
        {#each recent as update (update.manifest.id)}
          <StoreRow manifest={update.manifest} {onselect}>
            {#snippet detail()}
              <span class="font-mono">{update.release.version}</span> · {day(update.release.date)}{#if update.change}<span class="hidden @md:inline">{` · ${update.change.text}`}</span>{/if}
            {/snippet}
          </StoreRow>
        {/each}
      </ul>
    </section>
  {/if}
</div>
