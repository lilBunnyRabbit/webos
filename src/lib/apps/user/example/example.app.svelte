<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { z } from "zod";

  const { count: initial_count }: { count?: number } = $props();

  const { window, storage } = get_app_context();
  const count = storage.persisted("count", initial_count ?? 0, z.number());
</script>

<div>
  <h1>Example App</h1>
  <p>This is a simple example application.</p>
  <p>Count: {count.value}</p>
  <p>Focused: {window.is_focused}</p>
  <p>Size: {window.bounds.width} × {window.bounds.height}</p>
  <button onclick={() => count.value++}>Increment</button>
  <button onclick={() => window.maximize()}>Maximize</button>
  <button onclick={() => window.restore()}>Restore</button>
</div>
