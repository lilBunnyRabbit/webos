<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Input, Section, SettingRow, Switch } from "$lib/core/components/ui";
  import { ArrowsClockwise as ArrowsClockwiseIcon } from "phosphor-svelte";
  import CopyButton from "../copy-button.svelte";
  import { as_number } from "../form";
  import {
    DEFAULT_NUMBER_SETTINGS,
    MAX_NUMBER_COUNT,
    check_numbers,
    generate_numbers,
    number_settings_schema,
    type NumberSettings,
  } from "../numbers";

  const { storage } = get_app_context();
  const settings = storage.persisted<NumberSettings>("number", DEFAULT_NUMBER_SETTINGS, number_settings_schema);

  let results = $state.raw<number[]>([]);

  const checked = $derived(check_numbers(settings.value));
  const error = $derived(checked.ok ? null : checked.error);

  function set_number(key: "min" | "max" | "count", value: unknown) {
    settings.value = { ...settings.value, [key]: as_number(value) };
  }

  function generate() {
    if (checked.ok) results = generate_numbers(checked.value);
  }
</script>

<Section title="Range" description="Whole numbers between the two bounds, both included.">
  <SettingRow label="Minimum">
    {#snippet children({ id, describedby })}
      <Input {id} aria-describedby={describedby} type="number" step="1" size="sm" class="w-36" bind:value={() => settings.value.min, (value) => set_number("min", value)} />
    {/snippet}
  </SettingRow>
  <SettingRow label="Maximum">
    {#snippet children({ id, describedby })}
      <Input {id} aria-describedby={describedby} type="number" step="1" size="sm" class="w-36" bind:value={() => settings.value.max, (value) => set_number("max", value)} />
    {/snippet}
  </SettingRow>
  <SettingRow label="How many" description="Up to {MAX_NUMBER_COUNT} at once.">
    {#snippet children({ id, describedby })}
      <Input {id} aria-describedby={describedby} type="number" min="1" max={MAX_NUMBER_COUNT} step="1" size="sm" class="w-36" bind:value={() => settings.value.count, (value) => set_number("count", value)} />
    {/snippet}
  </SettingRow>
  <SettingRow label="No repeats" description="Every number appears at most once.">
    {#snippet children({ id, describedby })}
      <Switch {id} aria-describedby={describedby} bind:checked={() => settings.value.unique, (unique) => (settings.value = { ...settings.value, unique })} />
    {/snippet}
  </SettingRow>
</Section>

<div class="flex flex-wrap items-center gap-3">
  <Button variant="primary" disabled={error !== null} onclick={generate}><ArrowsClockwiseIcon weight="bold" />Generate</Button>
  {#if error}<p role="alert" class="text-ui text-error">{error}</p>{/if}
</div>

{#if results.length > 0}
  <Section title={results.length === 1 ? "Result" : `${results.length} results`}>
    {#snippet actions()}
      <CopyButton text={results.join(results.length > 1 ? ", " : "")} label="Copy numbers" />
    {/snippet}
    <output class="flex max-h-80 flex-wrap gap-x-4 gap-y-1 overflow-y-auto p-4 font-mono tabular-nums {results.length === 1 ? 'text-4xl font-semibold' : 'text-lg'}">
      {#each results as value, index (index)}<span>{value}</span>{/each}
    </output>
  </Section>
{/if}
