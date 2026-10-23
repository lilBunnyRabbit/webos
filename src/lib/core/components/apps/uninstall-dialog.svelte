<script lang="ts">
  import { AppIcon } from "$lib/core/components/ui";
  import type { AppManifest, DialogProps } from "$lib/core/api";
  import { Button, Checkbox } from "../ui";

  let { manifest, resolve }: DialogProps<{ data: boolean }> & { manifest: AppManifest } = $props();

  let data = $state(false);
</script>

<div class="grid w-[min(24rem,calc(100vw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover">
  <div class="flex items-start gap-3">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-background-light shadow-raised ring-1 ring-hairline">
      <AppIcon src={manifest.icon} class="size-5" />
    </span>
    <div class="min-w-0 pt-0.5">
      <h2 class="text-sm font-semibold break-words">Uninstall {manifest.name}?</h2>
      <p class="mt-0.5 text-ui break-words text-foreground/65">
        It leaves the start menu, and its windows, desktop icons and widgets close. Get it again from the App Library.
      </p>
    </div>
  </div>

  <label class="flex items-start gap-2.5 rounded-xl bg-background-light p-3 text-ui ring-1 ring-hairline">
    <Checkbox bind:checked={data} class="mt-0.5" />
    <span>
      <span class="font-medium">Also delete its saved data</span>
      <span class="block text-foreground/65">Its settings and app files. Your files in Home stay.</span>
    </span>
  </label>

  <div class="flex justify-end gap-2">
    <!-- svelte-ignore a11y_autofocus -->
    <Button variant="quiet" autofocus onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="danger" onclick={() => resolve({ data })}>Uninstall</Button>
  </div>
</div>
