<script lang="ts">
  import kernel, { type AppId, type AppsService } from "$lib/core/api";
  import ExperimentalBadge from "./experimental-badge.svelte";

  let { app_id, class: class_name }: { app_id: AppId; class?: string } = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));
  let experimental = $state(false);

  $effect(() => {
    const id = app_id;
    let current = true;
    void apps.meta(id).then((meta) => {
      if (current) experimental = meta.experimental === true;
    });
    return () => {
      current = false;
    };
  });
</script>

{#if experimental}<ExperimentalBadge class={class_name} />{/if}
