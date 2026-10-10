<script lang="ts">
  import kernel from "$lib/core/api";
  import LogoMark from "$lib/core/components/brand/logo-mark.svelte";
</script>

<div class="p-4">
  <header class="flex items-center gap-3 mb-4">
    <LogoMark class="h-8 w-auto text-primary" />
    <h1 class="text-xl font-semibold">Kernel</h1>
  </header>
  <p>Services: {kernel.services.size}</p>
  <ul class="list-disc list-inside">
    {#each kernel.services.entries() as [name, service] (name)}
      <li>{service.name}: {service.description}<br /><pre class="font-mono text-sm">{service.to_string()}</pre></li>
    {/each}
  </ul>
</div>
