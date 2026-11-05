<script lang="ts">
  import { SideNav } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import Base64 from "./sections/base64.svelte";
  import Cert from "./sections/cert.svelte";
  import Cron from "./sections/cron.svelte";
  import Hash from "./sections/hash.svelte";
  import Json from "./sections/json.svelte";
  import Jwt from "./sections/jwt.svelte";
  import Regex from "./sections/regex.svelte";
  import Time from "./sections/time.svelte";
  import Url from "./sections/url.svelte";
  import Uuid from "./sections/uuid.svelte";
  import { untrack } from "svelte";
  import { empty_storage, storage_schema } from "./storage";
  import { TOOLS, initial_state, to_stored } from "./tools";

  const { storage } = get_app_context();

  const saved = storage.file("storage.json", empty_storage(), storage_schema);

  // Copied once rather than bound to the file: each window keeps its own inputs instead of mirroring another window's
  // typing, and a new window opens on whatever was used last.
  const tools = $state(initial_state());
  let loaded = $state(false);
  $effect(() => {
    if (!saved.ready || untrack(() => loaded)) return;
    Object.assign(tools, $state.snapshot(saved.value.state));
    loaded = true;
  });
  $effect(() => {
    const snapshot = to_stored($state.snapshot(tools));
    if (loaded) untrack(() => (saved.value = { state: snapshot }));
  });

  const current = $derived(TOOLS.find((tool) => tool.value === tools.tool) ?? TOOLS[0]);
</script>

{#if loaded}
<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Tools" items={[...TOOLS]} bind:value={tools.tool} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
      <h1 class="text-lg font-semibold">{current.label}</h1>
      {#if tools.tool === "base64"}
        <Base64 bind:value={tools.base64} />
      {:else if tools.tool === "hash"}
        <Hash bind:value={tools.hash} />
      {:else if tools.tool === "url"}
        <Url bind:value={tools.url} />
      {:else if tools.tool === "uuid"}
        <Uuid bind:value={tools.uuid} />
      {:else if tools.tool === "regex"}
        <Regex bind:value={tools.regex} />
      {:else if tools.tool === "json"}
        <Json bind:value={tools.json} />
      {:else if tools.tool === "jwt"}
        <Jwt bind:value={tools.jwt} />
      {:else if tools.tool === "time"}
        <Time bind:value={tools.time} />
      {:else if tools.tool === "cron"}
        <Cron bind:value={tools.cron} />
      {:else}
        <Cert bind:value={tools.cert} />
      {/if}
    </div>
  </main>
</div>
{/if}
