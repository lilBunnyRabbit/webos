<script lang="ts">
  import kernel, { type AppsService, type DesktopService } from "$lib/core/api";
  import { Plus } from "@lucide/svelte";
  
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  // TODO: design, pin, etc, prevent from mounting when closed

  $effect(() => {
    console.log("start menu popover opened");

    return () => {
      console.log("start menu popover closed");
    };
  });
</script>

{#each apps.list() as [id, manifest] (id)}
  <div class="w-full flex items-center px-2 py-2 gap-4 hover:bg-foreground/10">
    <button
      popovertarget="start-menu-popover"
      popovertargetaction="hide"
      class="w-full flex items-center px-2 py-2 gap-4 hover:bg-foreground/10"
      onclick={() => {
        apps.launch(id);
      }}
    >
      <manifest.icon />
      {manifest.name}
    </button>

    <button
      class=" p-1 rounded hover:bg-foreground/20 transition"
      title="Pin to Desktop"
      onclick={() => {
        desktop.add_item(id);
      }}
      style="z-index:2;"
    >
      <Plus />
    </button>
  </div>
{/each}
