<script lang="ts">
  import kernel, { type StoreService } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { WifiSlash as WifiSlashIcon } from "phosphor-svelte";
  import { Button } from "../ui";
  import { open_offline_settings } from "./offline-actions";

  let { onopen, class: class_name }: { onopen?: () => void; class?: string } = $props();

  const offline = $derived(kernel.service<StoreService>("store"));
</script>

{#if !offline.online}
  <div role="status" class={cn("flex items-center gap-3 rounded-xl bg-warning/12 px-3 py-2 text-ui", class_name)}>
    <WifiSlashIcon class="size-4 shrink-0 text-warning" weight="bold" />
    <p class="min-w-0 flex-1 text-foreground/80">You're offline. Dimmed apps aren't saved on this device yet.</p>
    <Button
      size="sm"
      variant="quiet"
      class="shrink-0"
      onclick={() => {
        open_offline_settings();
        onopen?.();
      }}>Choose apps</Button
    >
  </div>
{/if}
