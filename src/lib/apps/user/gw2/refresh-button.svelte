<script lang="ts">
  import { IconButton, Spinner } from "$lib/core/components/ui";
  import { ArrowClockwise as ArrowClockwiseIcon } from "phosphor-svelte";

  let { at, loading, onrefresh }: { at: number | null; loading: boolean; onrefresh: () => void } = $props();

  const time = $derived(at === null ? "" : new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
</script>

{#if time}
  <span class="hidden truncate text-2xs text-foreground/65 @sm:inline">Updated {time}</span>
{/if}
<IconButton label="Refresh" size="sm" disabled={loading} onclick={onrefresh}>
  {#if loading}<Spinner label="Refreshing" />{:else}<ArrowClockwiseIcon weight="bold" />{/if}
</IconButton>
