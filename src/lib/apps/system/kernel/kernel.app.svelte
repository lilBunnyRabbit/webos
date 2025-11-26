<script lang="ts">

  const { count: initialCount }: { count: number } = $props();

  import kernel from "$lib/core/api";

  // Example Svelte component
  let count = $state(initialCount);
  console.log("initialCount", initialCount);
</script>

<div class="p-4">
  <h1>Kernel App</h1>
  <p>Services: {kernel.services.size}</p>
  <ul class="list-disc list-inside">
    {#each kernel.services.entries() as [name, service]}
      <li>{service.name}: {service.description}<br /><pre>{service.to_string()}</pre></li>
    {/each}
  </ul>
</div>
