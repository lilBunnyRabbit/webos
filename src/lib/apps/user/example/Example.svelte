<script lang="ts">
  // Example Svelte component
  let count = $state(0);

</script>

<div>
  <h1>Example App</h1>
  <p>This is a simple example application.</p>
  <p>Count: {count}</p>
  <button onclick={() => count++}>Increment</button>
</div>
