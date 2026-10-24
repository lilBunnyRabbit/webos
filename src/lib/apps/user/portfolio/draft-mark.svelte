<script lang="ts">
  import { Badge } from "$lib/core/components/ui";
  import { Publication } from "./content/types";

  let { status }: { status: Publication } = $props();
</script>

{#if import.meta.env.DEV && status === Publication.DRAFT}
  <Badge tone="warning" class="w-fit align-middle">Draft</Badge>
{/if}
