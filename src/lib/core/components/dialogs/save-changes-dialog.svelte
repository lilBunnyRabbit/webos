<script lang="ts">
  import { CloseChoice, type DialogProps } from "$lib/core/api";
  import { FloppyDisk as FloppyDiskIcon } from "phosphor-svelte";
  import { Button } from "../ui";

  let { title, can_save, resolve }: DialogProps<CloseChoice> & { title: string; can_save: boolean } = $props();
</script>

<!-- The close guard's sheet (ADR-029). Save gets the initial focus, like every OS; without a save it's Cancel. -->
<div class="grid w-[min(24rem,calc(100vw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover">
  <div class="flex items-start gap-3">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning">
      <FloppyDiskIcon class="size-5" weight="bold" />
    </span>
    <div class="min-w-0 pt-0.5">
      <h2 class="text-sm font-semibold break-words">Save changes to {title}?</h2>
      <p class="mt-0.5 text-ui break-words text-foreground/65">Your changes are lost if you don't save them.</p>
    </div>
  </div>

  <div class="flex flex-wrap justify-end gap-2">
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant="quiet" autofocus={!can_save} onclick={() => resolve(CloseChoice.CANCEL)}>Cancel</Button>
    <Button variant={can_save ? "secondary" : "danger"} onclick={() => resolve(CloseChoice.DISCARD)}>Don't save</Button>
    {#if can_save}
      <!-- svelte-ignore a11y_autofocus -->
      <Button variant="primary" autofocus onclick={() => resolve(CloseChoice.SAVE)}>Save</Button>
    {/if}
  </div>
</div>
