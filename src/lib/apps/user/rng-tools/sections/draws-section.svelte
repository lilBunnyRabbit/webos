<script lang="ts">
  import kernel, { type DialogsService, type MenuItem } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, EmptyState, IconButton, Input, Section, SettingRow } from "$lib/core/components/ui";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowUp as ArrowUpIcon,
    ArrowsClockwise as ArrowsClockwiseIcon,
    DotsThree as DotsThreeIcon,
    PencilSimple as PencilSimpleIcon,
    Plus as PlusIcon,
    Ticket as TicketIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import CopyButton from "../copy-button.svelte";
  import {
    MAX_DRAW_LISTS,
    MAX_DRAW_PRESETS,
    MAX_PRESET_NAME,
    check_preset,
    draw_preset,
    draw_presets_schema,
    draw_results_schema,
    format_draw,
    move,
    new_draft,
    new_list,
    same_lists,
    to_draft,
    type DrawPreset,
    type DrawPresetDraft,
    type DrawResult,
  } from "../draws";
  import { as_number } from "../form";

  const { storage, window: win } = get_app_context();
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  const presets = storage.persisted<DrawPreset[]>("draws", [], draw_presets_schema);
  const results = storage.window<Record<string, DrawResult>>("draws_results", {}, draw_results_schema);

  let draft = $state<DrawPresetDraft | null>(null);
  let name_input = $state<HTMLInputElement | null>(null);

  const editing = $derived(draft !== null && presets.value.some((preset) => preset.id === draft?.id));
  const checked_draft = $derived(draft ? check_preset(draft) : null);
  const draft_error = $derived(checked_draft && !checked_draft.ok ? checked_draft.error : null);

  $effect(() => {
    name_input?.focus();
  });

  $effect(() => {
    if (!draft) return;
    return win.on_back(() => {
      draft = null;
      return true;
    });
  });

  function draw(preset: DrawPreset) {
    const checked = check_preset(to_draft(preset));
    if (checked.ok) results.value = { ...results.value, [preset.id]: draw_preset(checked.value) };
  }

  function draw_all() {
    const next = { ...results.value };
    for (const preset of presets.value) {
      const checked = check_preset(to_draft(preset));
      if (checked.ok) next[preset.id] = draw_preset(checked.value);
    }
    results.value = next;
  }

  function forget_result(id: string) {
    results.value = Object.fromEntries(Object.entries(results.value).filter(([key]) => key !== id));
  }

  function save() {
    if (!checked_draft?.ok) return;
    const preset = checked_draft.value;
    const previous = presets.value.find((item) => item.id === preset.id);
    if (previous) {
      presets.value = presets.value.map((item) => (item.id === preset.id ? preset : item));
      if (!same_lists(previous.lists, preset.lists)) forget_result(preset.id);
    } else {
      presets.value = [...presets.value, preset];
    }
    draft = null;
  }

  async function remove(preset: DrawPreset) {
    const confirmed = await win.confirm(`Delete “${preset.name}”?`, {
      detail: "Its lists and last draw are removed. This can't be undone.",
      confirm_label: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    presets.value = presets.value.filter((item) => item.id !== preset.id);
    forget_result(preset.id);
  }

  async function open_menu(event: MouseEvent, preset: DrawPreset, index: number) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const count = presets.value.length;
    const items: MenuItem[] = [
      { id: "edit", label: "Edit", icon: PencilSimpleIcon },
      ...(count > 1
        ? [
            { id: "up", label: "Move up", icon: ArrowUpIcon, disabled: index === 0 },
            { id: "down", label: "Move down", icon: ArrowDownIcon, disabled: index === count - 1 },
          ]
        : []),
      { separator: true },
      { id: "delete", label: "Delete", icon: TrashIcon, danger: true },
    ];
    const choice = await dialogs.menu(items, { anchor: { x: rect.left, y: rect.bottom + 4 } });
    if (choice === "edit") draft = to_draft(preset);
    else if (choice === "up") presets.value = move(presets.value, index, -1);
    else if (choice === "down") presets.value = move(presets.value, index, 1);
    else if (choice === "delete") remove(preset);
  }
</script>

{#if draft}
  {@const lists = draft.lists}
  <Section title={editing ? "Edit preset" : "New preset"}>
    <SettingRow label="Name" description="Up to {MAX_PRESET_NAME} characters.">
      {#snippet children({ id, describedby })}
        <Input
          {id}
          aria-describedby={describedby}
          size="sm"
          class="w-full @md:w-56"
          maxlength={MAX_PRESET_NAME}
          autocomplete="off"
          placeholder="Lottery"
          bind:element={name_input}
          bind:value={() => draft!.name, (name) => (draft!.name = String(name ?? ""))}
        />
      {/snippet}
    </SettingRow>
  </Section>

  <Section title="Lists" description="Each list draws different numbers from its own range.">
    {#snippet actions()}
      {#if lists.length < MAX_DRAW_LISTS}
        <Button size="sm" variant="quiet" onclick={() => draft!.lists.push(new_list())}><PlusIcon weight="bold" />Add list</Button>
      {/if}
    {/snippet}
    {#each lists as list, index (list.id)}
      <div role="group" aria-label="List {index + 1}" class="flex flex-col gap-2 px-4 py-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">List {index + 1}</h3>
          <div class="flex items-center gap-0.5">
            <IconButton label="Move list up" size="sm" disabled={index === 0} onclick={() => (draft!.lists = move(lists, index, -1))}>
              <ArrowUpIcon weight="bold" />
            </IconButton>
            <IconButton label="Move list down" size="sm" disabled={index === lists.length - 1} onclick={() => (draft!.lists = move(lists, index, 1))}>
              <ArrowDownIcon weight="bold" />
            </IconButton>
            {#if lists.length > 1}
              <IconButton label="Remove list" size="sm" onclick={() => draft!.lists.splice(index, 1)}><TrashIcon weight="bold" /></IconButton>
            {/if}
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/80">
            Minimum
            <Input type="number" step="1" size="sm" bind:value={() => list.min, (value) => (list.min = as_number(value))} />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/80">
            Maximum
            <Input type="number" step="1" size="sm" bind:value={() => list.max, (value) => (list.max = as_number(value))} />
          </label>
          <label class="flex min-w-0 flex-col gap-1 text-2xs text-foreground/80">
            How many
            <Input type="number" min="1" step="1" size="sm" bind:value={() => list.count, (value) => (list.count = as_number(value))} />
          </label>
        </div>
      </div>
    {/each}
  </Section>

  <div class="flex flex-wrap items-center gap-3">
    <Button variant="primary" disabled={draft_error !== null} onclick={save}>{editing ? "Save preset" : "Create preset"}</Button>
    <Button variant="quiet" onclick={() => (draft = null)}>Cancel</Button>
    {#if draft_error}<p role="alert" class="text-ui text-error">{draft_error}</p>{/if}
  </div>
{:else if presets.value.length === 0}
  <Section>
    <EmptyState
      icon={TicketIcon}
      title="No presets yet"
      description="A preset draws one or more lists of different numbers at once, like a lottery ticket."
    >
      {#snippet actions()}
        <Button variant="primary" onclick={() => (draft = new_draft())}><PlusIcon weight="bold" />New preset</Button>
      {/snippet}
    </EmptyState>
  </Section>
{:else}
  <div class="flex flex-wrap items-center gap-3">
    <Button variant="primary" onclick={draw_all}><ArrowsClockwiseIcon weight="bold" />Draw all</Button>
    {#if presets.value.length < MAX_DRAW_PRESETS}
      <Button onclick={() => (draft = new_draft())}><PlusIcon weight="bold" />New preset</Button>
    {/if}
  </div>

  {#each presets.value as preset, index (preset.id)}
    {@const result = results.value[preset.id]}
    {@const checked = check_preset(to_draft(preset))}
    <Section title={preset.name}>
      {#snippet actions()}
        <CopyButton text={result ? format_draw(result) : ""} label="Copy numbers" />
        <IconButton label="More for “{preset.name}”" size="sm" onclick={(event) => open_menu(event, preset, index)}><DotsThreeIcon weight="bold" /></IconButton>
        <Button size="sm" disabled={!checked.ok} onclick={() => draw(preset)}><ArrowsClockwiseIcon weight="bold" />Draw</Button>
      {/snippet}
      {#if !checked.ok}
        <p role="alert" class="px-4 py-3 text-ui text-error">{checked.error} Edit the preset to fix it.</p>
      {/if}
      {#each preset.lists as list, list_index (list.id)}
        {@const values = result?.[list_index]}
        <div class="flex flex-col gap-2 px-4 py-3">
          <p class="font-mono text-2xs text-foreground/80 tabular-nums">{list.count} of {list.min}–{list.max}</p>
          <output aria-live="polite" class="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto">
            {#if values}
              {#each values as value (value)}
                <span class="grid h-9 min-w-9 place-items-center rounded-lg bg-primary/12 px-2 font-mono text-sm font-semibold text-primary tabular-nums">{value}</span>
              {/each}
            {:else}
              <span class="flex h-9 items-center text-ui text-foreground/65">Not drawn yet</span>
            {/if}
          </output>
        </div>
      {/each}
    </Section>
  {/each}
{/if}
