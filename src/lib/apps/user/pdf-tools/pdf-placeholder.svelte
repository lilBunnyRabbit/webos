<script lang="ts">
  import { Button, EmptyState, Spinner, type IconComponent } from "$lib/core/components/ui";
  import { FolderOpen as FolderOpenIcon, LockKey as LockKeyIcon, Warning as WarningIcon } from "phosphor-svelte";
  import type { PdfSlot } from "./pdf-slot.svelte";

  const {
    slot,
    icon,
    title,
    description,
    onopen,
  }: { slot: PdfSlot; icon: IconComponent; title: string; description: string; onopen: () => void } = $props();
</script>

{#snippet actions()}
  <Button variant="primary" onclick={onopen}><FolderOpenIcon weight="bold" /> Open a PDF…</Button>
{/snippet}

{#if slot.loading}
  <div class="grid h-full place-items-center"><Spinner label="Opening the PDF" /></div>
{:else if slot.error}
  <EmptyState icon={slot.error.locked ? LockKeyIcon : WarningIcon} tone="error" title={slot.error.title} description={slot.error.message} {actions} />
{:else}
  <EmptyState {icon} {title} {description} {actions} />
{/if}
