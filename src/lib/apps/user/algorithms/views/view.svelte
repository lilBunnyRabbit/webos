<script lang="ts">
  import type { View } from "../engine/step";
  import BarsView from "./bars-view.svelte";
  import ChainView from "./chain-view.svelte";
  import GraphView from "./graph-view.svelte";
  import GridView from "./grid-view.svelte";
  import PointsView from "./points-view.svelte";
  import RingView from "./ring-view.svelte";
  import TextView from "./text-view.svelte";
  import TreeView from "./tree-view.svelte";

  let { view }: { view: View } = $props();
</script>

{#if view.kind === "bars"}
  <BarsView {view} />
{:else if view.kind === "tree"}
  <TreeView {view} />
{:else if view.kind === "graph"}
  <GraphView {view} />
{:else if view.kind === "grid"}
  <GridView {view} />
{:else if view.kind === "ring"}
  <RingView {view} />
{:else if view.kind === "chain"}
  <ChainView {view} />
{:else if view.kind === "points"}
  <PointsView {view} />
{:else}
  <TextView {view} />
{/if}
