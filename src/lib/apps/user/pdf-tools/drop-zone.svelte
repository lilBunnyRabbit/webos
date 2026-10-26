<script lang="ts">
  import { has_drag_paths } from "$lib/core/components/files/drag";
  import { cn } from "$lib/core/utils";
  import { get_app_context } from "$lib/core/contexts/app";
  import { paste_files } from "$kit/utils/paste";
  import type { Snippet } from "svelte";
  import { accepts_drop, device_source, read_drop, type SourceFile } from "./pdf-files";

  interface Props {
    ondrop: (sources: SourceFile[]) => void;
    label: string;
    accept: string[];
    multiple?: boolean;
    active: boolean;
    class?: string;
    children: Snippet;
  }

  const { ondrop, label, accept, multiple = false, active, class: class_name, children }: Props = $props();
  const { window: win } = get_app_context();

  let root = $state<HTMLElement | null>(null);
  let over = $state(false);

  function on_dragover(event: DragEvent) {
    if (!accepts_drop(event)) return;
    event.preventDefault();
    // WebOS drags only allow "move"; a "copy" effect would make the browser refuse the drop.
    if (event.dataTransfer) event.dataTransfer.dropEffect = has_drag_paths(event) ? "move" : "copy";
    over = true;
  }

  function on_dragleave(event: DragEvent) {
    if (!root?.contains(event.relatedTarget as Node | null)) over = false;
  }

  function on_drop(event: DragEvent) {
    if (!accepts_drop(event)) return;
    event.preventDefault();
    over = false;
    void read_drop(event).then((sources) => sources.length && ondrop(sources));
  }
</script>

<div
  bind:this={root}
  {@attach active && paste_files({ win, accept, multiple, onfiles: (files) => ondrop(files.map(device_source)) })}
  class={cn("relative", class_name)} role="region" aria-label={label} ondragenter={on_dragover} ondragover={on_dragover} ondragleave={on_dragleave} ondrop={on_drop}>
  {@render children()}
  {#if over}
    <div class="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-xl bg-primary/8 ring-2 ring-primary/70">
      <span class="rounded-lg bg-background-light px-3 py-1.5 text-ui font-medium shadow-raised">{label}</span>
    </div>
  {/if}
</div>
