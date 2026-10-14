<script lang="ts">
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { z } from "zod";
  import { json_file } from "../json-file.svelte";

  const props: { path: string } = $props();
  const cell = json_file(untrack(() => props.path), { count: 0 }, z.object({ count: z.number() }));
  $effect(() => () => cell.release());
</script>

<div out:fade={{ duration: 400 }}>{cell.value.count}</div>
