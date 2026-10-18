<script lang="ts">
  import { Badge, Button, Input, Select, Slider } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { CaretDown as CaretDownIcon, Lightning as LightningIcon } from "phosphor-svelte";
  import { untrack, type Component } from "svelte";
  import type { CatalogEntry } from "./catalog";
  import { record, type Definition, type Params } from "./engine/definition";
  import { InputError, InputKind } from "./engine/inputs";
  import InputBar from "./input-bar.svelte";
  import Player from "./player.svelte";

  let {
    entry,
    definition,
    input,
    params,
    onchange,
  }: {
    entry: CatalogEntry;
    definition: Definition;
    input: unknown;
    params: Params;
    onchange: (input: unknown, params: Params) => void;
  } = $props();

  let about = $state(false);
  let editing = $state(false);
  let start = $state(0);
  let autoplay = $state(false);
  let operation = $state(untrack(() => definition.operations?.list[0]?.id ?? ""));
  let operand = $state("");
  let operation_error = $state<string | null>(null);

  const recording = $derived(record(definition, input, params));
  const preset_options = $derived([{ value: "", label: "Presets" }, ...(definition.presets ?? []).map((preset, index) => ({ value: String(index), label: preset.label }))]);
  const current_operation = $derived(definition.operations?.list.find((item) => item.id === operation));
  const editor_kind = $derived(definition.input.kind === InputKind.TEXT ? null : definition.input.kind);

  function validate(value: unknown): string | null {
    const result = definition.input.schema.safeParse(value);
    return result.success ? null : (result.error.issues[0]?.message ?? "That input doesn't work here.");
  }

  function change(next_input: unknown, next_params: Params = params) {
    start = 0;
    autoplay = false;
    onchange(next_input, next_params);
  }

  function pick_preset(value: string) {
    const preset = definition.presets?.[Number(value)];
    if (value !== "" && preset) change(preset.value);
  }

  function set_param(id: string, value: number | string) {
    change(input, { ...params, [id]: value });
  }

  function run_operation(event: SubmitEvent) {
    event.preventDefault();
    if (!definition.operations || !current_operation) return;
    try {
      const next = definition.operations.apply(input, operation, operand.trim());
      const before = recording.steps.length;
      operation_error = null;
      operand = "";
      onchange(next, params);
      start = before;
      autoplay = true;
    } catch (reason) {
      operation_error = reason instanceof InputError ? reason.message : "That doesn't work here.";
    }
  }

  const complexity = $derived([
    { label: "Best", value: entry.complexity.best },
    { label: "Average", value: entry.complexity.average },
    { label: "Worst", value: entry.complexity.worst },
    { label: "Space", value: entry.complexity.space },
  ]);

  let Editor = $state<Component<{ value: unknown; onchange: (value: unknown) => void; validate: (value: unknown) => string | null }> | null>(null);
  $effect(() => {
    const kind = editor_kind;
    if (!kind) return;
    let current = true;
    const load = kind === InputKind.GRAPH ? import("./graph-editor.svelte") : import("./points-editor.svelte");
    void load.then((module) => {
      if (current) Editor = module.default as Component<{ value: unknown; onchange: (value: unknown) => void; validate: (value: unknown) => string | null }>;
    });
    return () => {
      current = false;
    };
  });
</script>

<div class="flex min-h-full flex-col gap-4 px-4 py-4 @4xl:h-full @4xl:min-h-0 @4xl:px-5">
  <header class="flex flex-col gap-2">
    <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h1 class="text-lg font-semibold">{entry.name}</h1>
        <p class="text-ui text-foreground/80">{entry.summary}</p>
      </div>
      <Button size="sm" variant="quiet" aria-expanded={about} onclick={() => (about = !about)}>
        {about ? "Less" : "How it works"}
        <CaretDownIcon weight="bold" class={cn("transition-transform duration-150", about && "rotate-180")} />
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-1.5">
      {#if entry.complexity.average !== "–"}<Badge class="font-mono">avg {entry.complexity.average}</Badge>{/if}
      {#if entry.complexity.space !== "–"}<Badge class="font-mono">space {entry.complexity.space}</Badge>{/if}
      {#each definition.traits ?? [] as trait (trait)}
        <Badge tone="primary">{trait}</Badge>
      {/each}
    </div>
    {#if about}
      <div class="grid gap-4 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8 @2xl:grid-cols-[minmax(0,1fr)_auto]">
        <div class="flex max-w-prose flex-col gap-2">
          <p class="text-sm text-pretty">{definition.intro}</p>
          <p class="flex gap-2 text-sm text-pretty text-foreground/80">
            <LightningIcon weight="duotone" class="mt-0.5 size-4 shrink-0 text-primary" />
            <span><span class="font-medium text-foreground">When to use it.</span> {definition.use}</span>
          </p>
          {#if definition.credit}
            <p class="text-ui text-foreground/80">
              Based on <a class="text-primary underline-offset-2 hover:underline" href={definition.credit.url} target="_blank" rel="noopener">{definition.credit.text}</a>.
            </p>
          {/if}
        </div>
        <table class="h-fit text-ui">
          <tbody>
            {#each complexity as row (row.label)}
              <tr class="border-b border-foreground/8 last:border-b-0">
                <th scope="row" class="py-1 pr-4 text-left font-medium text-foreground/80">{row.label}</th>
                <td class="py-1 text-right font-mono tabular-nums">{row.value}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </header>

  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-start gap-2">
      {#key input}
        <InputBar spec={definition.input} value={input} onchange={(value) => change(value)} />
      {/key}
      {#if definition.presets?.length}
        <Select size="md" aria-label="Presets" class="w-40" options={preset_options} bind:value={() => "", pick_preset} />
      {/if}
      {#if editor_kind}
        <Button size="md" variant={editing ? "primary" : "secondary"} aria-pressed={editing} onclick={() => (editing = !editing)}>
          {editing ? "Done" : editor_kind === InputKind.GRAPH ? "Draw graph" : "Place points"}
        </Button>
      {/if}
    </div>

    {#if definition.params?.length}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        {#each definition.params as param (param.id)}
          <label class="flex items-center gap-2 text-ui text-foreground/80">
            <span class="font-medium whitespace-nowrap">{param.label}</span>
            {#if param.kind === "choice"}
              <Select size="sm" options={param.choices} bind:value={() => String(params[param.id] ?? param.default), (value) => set_param(param.id, value)} />
            {:else}
              <Slider size="sm" class="w-28" min={param.min} max={param.max} step={param.step ?? 1} bind:value={() => Number(params[param.id] ?? param.default), (value) => set_param(param.id, Number(value))} />
              <span class="w-8 font-mono text-ui text-foreground tabular-nums">{params[param.id] ?? param.default}</span>
            {/if}
          </label>
        {/each}
      </div>
    {/if}

    {#if definition.operations}
      <form class="flex flex-wrap items-center gap-1.5" onsubmit={run_operation}>
        <span class="text-ui font-medium text-foreground/80">Try it</span>
        <Select size="sm" aria-label="Operation" options={definition.operations.list.map((item) => ({ value: item.id, label: item.label }))} bind:value={operation} />
        {#if current_operation?.placeholder}
          <Input size="sm" aria-label="Value" class="w-28 font-mono" placeholder={current_operation.placeholder} bind:value={operand} autocomplete="off" />
        {/if}
        <Button type="submit" size="sm" variant="primary" disabled={Boolean(current_operation?.placeholder) && !operand.trim()}>Go</Button>
        {#if operation_error}<span class="text-2xs text-error">{operation_error}</span>{/if}
      </form>
    {/if}
  </div>

  <div class="min-h-0 @4xl:flex-1">
    {#snippet editor_stage()}
      {#if Editor}
        <Editor value={input} onchange={(value) => change(value)} {validate} />
      {/if}
    {/snippet}
    <Player {recording} pseudocode={definition.pseudocode} {start} {autoplay} stage_override={editing && Editor ? editor_stage : undefined} />
  </div>
</div>
