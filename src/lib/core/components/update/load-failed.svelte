<script lang="ts">
  import kernel, { type VersionService } from "$lib/core/api";
  import { Button, EmptyState } from "$lib/core/components/ui";
  import { error_message } from "$lib/core/utils";
  import { untrack } from "svelte";
  import { ArrowCircleUp as ArrowCircleUpIcon, Warning as WarningIcon } from "phosphor-svelte";

  let { error, what = "app", compact = false }: { error: unknown; what?: "app" | "widget"; compact?: boolean } = $props();

  const version = $derived(kernel.service<VersionService>("version"));

  // A failed lazy import is usually a deploy: this page asks for chunks the new build replaced. Waiting for the
  // half-hourly poll would leave the window dead, so check now and offer the update in place.
  $effect(() => untrack(() => void version.check()));

  const update = $derived(version.update_available);
</script>

{#if compact}
  <div class="grid h-full place-content-center justify-items-center gap-2 p-3 text-center text-ui">
    {#if update}
      <p class="text-foreground/65">WebOS v{update.version} is out. Update to load this {what}.</p>
      <Button size="sm" onclick={() => void version.apply_update()}>Update and reload</Button>
    {:else}
      <p class="text-error">Couldn't load this {what}.</p>
    {/if}
  </div>
{:else if update}
  <EmptyState
    icon={ArrowCircleUpIcon}
    title="WebOS was updated"
    description="v{update.version} replaced this {what}'s files since the page loaded. Update to open it; your open windows are offered back."
  >
    {#snippet actions()}
      <Button onclick={() => void version.apply_update()}><ArrowCircleUpIcon weight="bold" /> Update and reload</Button>
    {/snippet}
  </EmptyState>
{:else}
  <EmptyState
    icon={WarningIcon}
    tone="error"
    title="This {what} failed to load"
    description={version.is_checking ? "Checking for a newer version…" : error_message(error)}
  />
{/if}
