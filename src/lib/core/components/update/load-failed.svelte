<script lang="ts">
  import kernel, { type StoreService, type VersionService } from "$lib/core/api";
  import { Button, EmptyState } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import {
    ArrowClockwise as ArrowClockwiseIcon,
    ArrowCircleUp as ArrowCircleUpIcon,
    Warning as WarningIcon,
    WifiSlash as WifiSlashIcon,
  } from "phosphor-svelte";
  import { OFFLINE_NOTE, open_offline_settings } from "../apps/offline-actions";
  import { failure_details, load_failure, LoadFailure } from "./load-error";

  interface Props {
    error: unknown;
    name?: string;
    what?: "app" | "widget";
    compact?: boolean;
    onretry?: () => void;
    onclose?: () => void;
  }

  let { error, name, what = "app", compact = false, onretry, onclose }: Props = $props();

  const version = $derived(kernel.service<VersionService>("version"));
  const offline = $derived(kernel.service<StoreService>("store"));

  // A failed lazy import is usually a deploy: this page asks for chunks the new build replaced. Waiting for the
  // half-hourly poll would leave the window dead, so check now and offer the update in place.
  $effect(() => untrack(() => void version.check()));

  const update = $derived(version.update_available);
  const kind = $derived(load_failure(error));
  const details = $derived(failure_details(error));
  const headline = $derived(name ? `${name} didn't load` : `This ${what} didn't load`);
  const cause = $derived.by(() => {
    if (version.is_checking) return "Checking for a newer version of WebOS…";
    if (kind === LoadFailure.FETCH) {
      return "Its code didn't download. The connection may have dropped, or WebOS changed since this page opened.";
    }
    return "It hit an error while starting. Reloading WebOS may fix it; the details say what went wrong.";
  });
  // The browser keeps a module that threw, so importing it again only repeats the error.
  const retryable = $derived(!!onretry && kind === LoadFailure.FETCH);
</script>

{#snippet close_button()}
  {#if onclose}<Button variant="quiet" class="pointer-coarse:h-11" onclick={onclose}>Close window</Button>{/if}
{/snippet}

{#if compact}
  <div class="grid h-full place-content-center justify-items-center gap-2 p-3 text-center text-ui">
    {#if !offline.online}
      <p class="text-foreground/80">Not saved for offline.</p>
    {:else if update}
      <p class="text-foreground/80">WebOS v{update.version} is out. Update to load this {what}.</p>
      <Button size="sm" onclick={() => void version.apply_update()}>Update and reload</Button>
    {:else}
      <p class="flex items-center gap-1.5 text-foreground/80"><WarningIcon weight="duotone" class="size-4 shrink-0 text-error" /> Couldn't load this {what}.</p>
    {/if}
  </div>
{:else if !offline.online}
  <EmptyState icon={WifiSlashIcon} title={name ? `${name} isn't saved for offline` : `This ${what} isn't saved for offline`} description={OFFLINE_NOTE}>
    {#snippet actions()}
      <Button variant="primary" class="pointer-coarse:h-11" onclick={open_offline_settings}>Choose apps</Button>
      {@render close_button()}
    {/snippet}
  </EmptyState>
{:else if update}
  <EmptyState
    icon={ArrowCircleUpIcon}
    title={headline}
    description="WebOS v{update.version} came out after this page opened and replaced this {what}'s files. Update to open it; your open windows are offered back."
    {details}
  >
    {#snippet actions()}
      <Button variant="primary" class="pointer-coarse:h-11" onclick={() => void version.apply_update()}>
        <ArrowCircleUpIcon weight="bold" /> Update and reload
      </Button>
      {@render close_button()}
    {/snippet}
  </EmptyState>
{:else}
  <EmptyState icon={WarningIcon} tone="error" title={headline} description={cause} {details}>
    {#snippet actions()}
      {#if retryable}
        <Button variant="primary" class="pointer-coarse:h-11" disabled={version.is_checking} onclick={onretry}>
          <ArrowClockwiseIcon weight="bold" /> Try again
        </Button>
      {/if}
      <Button variant={retryable ? "secondary" : "primary"} class="pointer-coarse:h-11" onclick={() => location.reload()}>Reload WebOS</Button>
      {@render close_button()}
    {/snippet}
  </EmptyState>
{/if}
