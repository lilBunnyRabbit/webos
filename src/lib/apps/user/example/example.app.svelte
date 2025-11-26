<script lang="ts">

  const { count: initialCount }: { count: number } = $props();
  // Example Svelte component
  let count = $state(initialCount);
  console.log("initialCount", initialCount);
</script>

<div>
  <h1>Example App</h1>
  <p>This is a simple example application.</p>
  <p>Count: {count}</p>
  <button onclick={() => count++}>Increment</button>
</div>
