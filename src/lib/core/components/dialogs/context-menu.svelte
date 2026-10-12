<script lang="ts">
  import type { DialogProps, MenuItem } from "$lib/core/api";
  import ContextMenuList from "./context-menu-list.svelte";

  let { items, sheet = false, resolve }: DialogProps<string> & { items: MenuItem[]; sheet?: boolean } = $props();
</script>

<ContextMenuList {items} {sheet} onselect={(id) => resolve(id)} />
