<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Input, Section, Segmented, field } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Shuffle as ShuffleIcon } from "phosphor-svelte";
  import CopyButton from "../copy-button.svelte";
  import { as_number } from "../form";
  import {
    DEFAULT_LIST_SETTINGS,
    ListMode,
    check_list,
    format_list_result,
    list_settings_schema,
    parse_lines,
    run_list,
    type ListResult,
    type ListSettings,
  } from "../list";

  const MODE_OPTIONS = [
    { value: ListMode.PICK_ONE, label: "Pick one" },
    { value: ListMode.PICK_MANY, label: "Pick some" },
    { value: ListMode.SHUFFLE, label: "Shuffle" },
    { value: ListMode.TEAMS, label: "Teams" },
  ];
  const ACTION_LABELS: Record<ListMode, string> = {
    [ListMode.PICK_ONE]: "Pick",
    [ListMode.PICK_MANY]: "Pick",
    [ListMode.SHUFFLE]: "Shuffle",
    [ListMode.TEAMS]: "Make teams",
  };

  const { storage } = get_app_context();
  const settings = storage.persisted<ListSettings>("list", DEFAULT_LIST_SETTINGS, list_settings_schema);

  let result = $state.raw<ListResult | null>(null);

  const items = $derived(parse_lines(settings.value.text));
  const checked = $derived(check_list(items, settings.value));

  function update(patch: Partial<ListSettings>) {
    settings.value = { ...settings.value, ...patch };
  }

  function run() {
    if (checked.ok) result = run_list(items, checked.value);
  }
</script>

<Section title="Entries" description="One per line. Blank lines are skipped; repeated lines count twice.">
  <div class="flex flex-col gap-3 p-4">
    <textarea
      aria-label="Entries"
      rows="8"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder={"Ana\nBo\nCai"}
      class={field({ class: "h-auto min-h-24 resize-y py-2 font-mono leading-relaxed pointer-coarse:h-auto" })}
      bind:value={() => settings.value.text, (text) => update({ text })}
    ></textarea>
    <p class="font-mono text-2xs text-foreground/65 tabular-nums">{items.length} {items.length === 1 ? "entry" : "entries"}</p>
  </div>
</Section>

<div class="flex flex-col gap-3">
  <Segmented label="What to do" class="max-w-full self-start overflow-x-auto" options={MODE_OPTIONS} bind:value={() => settings.value.mode, (mode) => update({ mode })} />

  <div class="flex flex-wrap items-center gap-3">
    {#if settings.value.mode === ListMode.PICK_MANY}
      <label class="flex items-center gap-2 text-ui">
        How many
        <Input type="number" min="1" step="1" size="sm" class="w-20" bind:value={() => settings.value.pick_count, (value) => update({ pick_count: as_number(value) })} />
      </label>
    {:else if settings.value.mode === ListMode.TEAMS}
      <label class="flex items-center gap-2 text-ui">
        Teams
        <Input type="number" min="2" step="1" size="sm" class="w-20" bind:value={() => settings.value.team_count, (value) => update({ team_count: as_number(value) })} />
      </label>
    {/if}
    <Button variant="primary" disabled={!checked.ok} onclick={run}><ShuffleIcon weight="bold" />{ACTION_LABELS[settings.value.mode]}</Button>
    {#if !checked.ok && items.length > 0}<p role="alert" class="text-ui text-error">{checked.error}</p>{/if}
  </div>
</div>

{#if result}
  <Section title="Result">
    {#snippet actions()}
      <CopyButton text={format_list_result(result!)} label="Copy result" />
    {/snippet}
    {#if result.kind === "items"}
      <ol class={cn("max-h-96 overflow-y-auto p-2", result.items.length === 1 && "p-4")}>
        {#each result.items as item, index (index)}
          {#if result.items.length === 1}
            <li class="text-center text-2xl font-semibold break-words text-primary">{item}</li>
          {:else}
            <li class="flex gap-3 rounded-md px-2 py-1 text-ui">
              <span class="w-6 shrink-0 text-right font-mono text-foreground/65 tabular-nums">{index + 1}</span>
              <span class="min-w-0 break-words">{item}</span>
            </li>
          {/if}
        {/each}
      </ol>
    {:else}
      <div class="grid grid-cols-1 gap-px @md:grid-cols-2 @2xl:grid-cols-3">
        {#each result.teams as team, index (index)}
          <div class="flex flex-col gap-1 p-4">
            <h3 class="text-2xs font-medium uppercase tracking-wide text-foreground/65">Team {index + 1} · {team.length}</h3>
            <ul class="flex flex-col gap-0.5 text-ui">
              {#each team as member, member_index (member_index)}<li class="break-words">{member}</li>{/each}
            </ul>
          </div>
        {/each}
      </div>
    {/if}
  </Section>
{/if}
