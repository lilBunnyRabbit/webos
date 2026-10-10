<script lang="ts">
  import kernel, { type AppsService, type DesktopService } from "$lib/core/api";
  import { Plus as PlusIcon } from "phosphor-svelte";
  import LogoLockup from "../brand/logo-lockup.svelte";
  
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  // TODO: design, pin, etc, prevent from mounting when closed
</script>

<div class="sticky top-0 flex items-center justify-between py-4 px-2 bg-background border-b border-foreground/20">
  <LogoLockup height={32} />
  <span class="font-mono text-sm text-foreground/65">WebOS</span>
</div>

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
      <manifest.icon class="size-6" />
      {manifest.name}
    </button>

    <button
      class=" p-1 rounded hover:bg-foreground/20 transition"
      title="Pin to Desktop"
      onclick={() => {
        desktop.pin(id).catch((error) => console.error(`[StartMenu] Failed to pin ${id}`, error));
      }}
      style="z-index:2;"
    >
      <PlusIcon class="size-6" />
    </button>
  </div>
{/each}
