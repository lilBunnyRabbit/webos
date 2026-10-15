<script lang="ts">
  import type { Component } from "svelte";
  import "./app.css";
  import WebOS from "./lib/core/web-os.svelte";

  let { shell }: { shell: Component } = $props();
</script>

<WebOS {shell} />
