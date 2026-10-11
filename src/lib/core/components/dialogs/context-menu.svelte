<script lang="ts">
  import type { DialogProps, MenuItem } from "$lib/core/api";
  import ContextMenuList from "./context-menu-list.svelte";

  let { items, resolve }: DialogProps<string> & { items: MenuItem[] } = $props();
</script>

<ContextMenuList {items} onselect={(id) => resolve(id)} />
