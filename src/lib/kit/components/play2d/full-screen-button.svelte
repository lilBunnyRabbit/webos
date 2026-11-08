<script lang="ts">
  import { ArrowsOutSimple as ArrowsOutSimpleIcon } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { IconButton } from "$lib/core/components/ui";

  const { window: win } = get_app_context();
</script>

<IconButton size="sm" label="Full screen (F11)" onclick={() => win.set_immersive(true)}>
  <ArrowsOutSimpleIcon weight="bold" />
</IconButton>
