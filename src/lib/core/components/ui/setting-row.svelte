<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/core/utils";

  /**
   * Label and description on the left, the control on the right; stacks in narrow windows (container query). The
   * snippet receives the ids to put on the control, so it gets its accessible name and description from this row.
   */
  let {
    label,
    description,
    class: class_name,
    children,
  }: {
    label: string;
    description?: string;
    class?: string;
    children: Snippet<[{ id: string; describedby: string | undefined }]>;
  } = $props();

  const uid = $props.id();
  const id = `${uid}-control`;
  const describedby = $derived(description ? `${uid}-description` : undefined);
</script>

<div class={cn("@container", class_name)}>
  <div class="flex flex-col gap-2 px-4 py-3 @md:flex-row @md:items-center @md:justify-between @md:gap-6">
    <div class="min-w-0">
      <label for={id} class="block text-ui font-medium">{label}</label>
      {#if description}<p id={describedby} class="text-2xs text-foreground/80">{description}</p>{/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">{@render children({ id, describedby })}</div>
  </div>
</div>
