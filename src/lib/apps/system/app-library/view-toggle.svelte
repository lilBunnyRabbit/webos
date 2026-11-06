<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { ListBullets as ListBulletsIcon, SquaresFour as SquaresFourIcon } from "phosphor-svelte";
  import { ViewMode } from "./library";

  let { view = $bindable() }: { view: ViewMode } = $props();
</script>

<div role="group" aria-label="View" class="flex shrink-0">
  <IconButton label="Cards" size="sm" pressed={view === ViewMode.GRID} onclick={() => (view = ViewMode.GRID)}><SquaresFourIcon /></IconButton>
  <IconButton label="List" size="sm" pressed={view === ViewMode.LIST} onclick={() => (view = ViewMode.LIST)}><ListBulletsIcon /></IconButton>
</div>
