<script lang="ts">
  import { Button, CopyButton, Input, Section, Segmented } from "$lib/core/components/ui";
  import { ArrowsClockwise as ArrowsClockwiseIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import type { DevToolsState } from "../tools";
  import { MAX_UUIDS, UuidVersion, generate_uuids } from "../uuid";

  let { value = $bindable() }: { value: DevToolsState["uuid"] } = $props();

  const VERSION_OPTIONS = [
    { value: UuidVersion.V4, label: "v4 random" },
    { value: UuidVersion.V7, label: "v7 time-ordered" },
  ];

  let ids = $state.raw<string[]>(untrack(() => generate_uuids(value.version, value.count)));

  function generate() {
    ids = generate_uuids(value.version, value.count);
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <div class="contents" onchange={generate}>
    <Segmented label="Version" options={VERSION_OPTIONS} bind:value={value.version} />
  </div>
  <label class="flex items-center gap-2 text-ui">
    Count
    <Input
      type="number"
      min={1}
      max={MAX_UUIDS}
      class="w-20 font-mono"
      value={value.count}
      onchange={(event) => {
        const count = event.currentTarget.valueAsNumber;
        value.count = Number.isFinite(count) ? Math.min(MAX_UUIDS, Math.max(1, Math.floor(count))) : 1;
        generate();
      }}
    />
  </label>
  <Button size="md" variant="primary" onclick={generate}><ArrowsClockwiseIcon weight="bold" />Generate</Button>
</div>

<Section title={ids.length === 1 ? "UUID" : `${ids.length} UUIDs`} flush>
  {#snippet actions()}
    <CopyButton text={ids.join("\n")} label={ids.length === 1 ? "Copy" : "Copy all"} />
  {/snippet}
  <ol class="max-h-96 divide-y divide-foreground/8 overflow-y-auto rounded-xl bg-background-light ring-1 ring-foreground/8">
    {#each ids as id, i (i)}
      <li class="flex items-center gap-2 py-1 pr-1 pl-3">
        <span class="min-w-0 flex-1 truncate font-mono text-ui select-all">{id}</span>
        <CopyButton text={id} />
      </li>
    {/each}
  </ol>
</Section>
