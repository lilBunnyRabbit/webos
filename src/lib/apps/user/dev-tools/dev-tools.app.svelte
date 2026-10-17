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
  import { DevToolsState, TOOLS, initial_state, to_stored } from "./tools";

  const { storage } = get_app_context();

  // Read once and saved on change rather than `persisted()`: each window keeps its own inputs instead of mirroring
  // another window's typing, and a new window opens on whatever was used last.
  const tools = $state(storage.get("state", DevToolsState) ?? initial_state());

  const SAVE_DELAY_MS = 500;
  let unsaved: DevToolsState | null = null;
  function save() {
    if (unsaved) storage.set("state", to_stored(unsaved));
    unsaved = null;
  }
  $effect(() => {
    unsaved = $state.snapshot(tools);
    const timer = setTimeout(save, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  });
  // Cleanup only: closing the window writes an edit still waiting on the delay.
  $effect(() => save);

  const current = $derived(TOOLS.find((tool) => tool.value === tools.tool) ?? TOOLS[0]);
</script>

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
