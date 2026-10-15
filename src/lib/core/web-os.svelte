<script lang="ts">
  import type { Component } from "svelte";
  import OS from "$lib/core/components/os.svelte";

  let { shell }: { shell: Component } = $props();
</script>

<OS {shell} />
