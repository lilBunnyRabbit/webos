<script lang="ts">

  const { count: initial_count }: { count: number } = $props();
  // Example Svelte component
  let count = $state(initial_count);
  console.log("initial_count", initial_count);
</script>

<div>
  <h1>Example App</h1>
  <p>This is a simple example application.</p>
  <p>Count: {count}</p>
  <button onclick={() => count++}>Increment</button>
</div>
