<script lang="ts">
  import { Button, EmptyState, Spinner } from "$lib/core/components/ui";
  import { FolderOpen as FolderOpenIcon, LockKey as LockKeyIcon, Warning as WarningIcon } from "phosphor-svelte";
  import type { PdfSlot } from "./pdf-slot.svelte";
  import type { Section } from "./sections";
  import ToolArt from "./tool-art.svelte";

  interface Props {
    slot: PdfSlot;
    tool: Section;
    title: string;
    description: string;
    steps: string[];
    onopen: () => void;
  }

  const { slot, tool, title, description, steps, onopen }: Props = $props();
</script>

{#snippet actions()}
  <Button variant="primary" onclick={onopen}><FolderOpenIcon weight="bold" /> Open a PDF…</Button>
{/snippet}

{#if slot.loading}
  <div class="grid h-full place-items-center"><Spinner label="Opening the PDF" /></div>
{:else if slot.error}
  <EmptyState icon={slot.error.locked ? LockKeyIcon : WarningIcon} tone="error" title={slot.error.title} description={slot.error.message} {actions} />
{:else}
  <EmptyState {title} {description} {steps} {actions} hint="Or drop a PDF anywhere here, or paste one.">
    {#snippet illustration()}<ToolArt {tool} />{/snippet}
  </EmptyState>
{/if}
