<script lang="ts">
  import { Button, Select, Spinner, Toolbar } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { CHAR_SET_LABELS, type CharSet } from "./charsets";
  import { QuadFrame } from "$kit/components/quad-frame";
  import { default_quad, type Quad } from "$kit/utils/perspective";
  import type { ScanImage } from "./scan-image";

  interface Props {
    scan: ScanImage;
    found: Quad | null;
    sets: CharSet[];
    set: CharSet;
    busy: boolean;
    onapply: (set: CharSet, corners: Quad) => void;
    oncancel: () => void;
  }

  let { scan, found, sets, set: initial_set, busy, onapply, oncancel }: Props = $props();

  let corners = $state<Quad>(untrack(() => (found ? ([...found] as Quad) : default_quad(scan.gray.width, scan.gray.height))));
  let set = $state<CharSet>(untrack(() => initial_set));
  const LABELS: [string, string, string, string] = ["Top left (the square with a hole)", "Top right", "Bottom right", "Bottom left"];
</script>

<div class="absolute inset-0 z-10 grid grid-rows-[auto_auto_minmax(0,1fr)] bg-background">
  <Toolbar class="gap-2">
    <Button size="sm" variant="quiet" onclick={oncancel}>Cancel</Button>
    <span class="min-w-0 flex-[1_1_8rem] truncate text-ui font-medium">Line up the corners</span>
    {#if sets.length > 1}
      <Select size="sm" aria-label="Which sheet" class="ml-auto max-w-40" options={sets.map((value) => ({ value, label: CHAR_SET_LABELS[value] }))} bind:value={set} />
    {/if}
    <Button size="sm" variant="primary" disabled={busy} onclick={() => onapply(set, $state.snapshot(corners) as Quad)}>
      {#if busy}<Spinner label="Reading the sheet" class="size-3.5" />{/if}Use guides
    </Button>
  </Toolbar>
  <p class={["border-b border-foreground/8 px-3 py-2 text-ui", found ? "text-foreground/80" : "bg-warning/10"]} aria-live="polite">
    {found
      ? "Found the four corner squares. Drag a corner if it's off."
      : "Couldn't find the corner squares. Drag each corner onto its square; the top left one has a hole."}
  </p>
  <QuadFrame
    bind:quad={corners}
    image={{ src: scan.url, width: scan.gray.width, height: scan.gray.height }}
    alt="The scanned sheet"
    labels={LABELS}
    marked={0}
    class="bg-background-darker p-4"
  />
</div>
