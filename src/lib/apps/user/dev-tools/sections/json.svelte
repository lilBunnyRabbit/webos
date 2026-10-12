<script lang="ts">
  import { Button, Section, Select } from "$lib/core/components/ui";
  import { CheckCircle as CheckCircleIcon } from "phosphor-svelte";
  import { JsonIndent, format_json, minify_json, type JsonResult } from "../json";
  import type { DevToolsState } from "../tools";
  import CopyButton from "./copy-button.svelte";
  import TextArea from "./text-area.svelte";

  let { value = $bindable() }: { value: DevToolsState["json"] } = $props();

  const INDENT_OPTIONS = [
    { value: JsonIndent.TWO, label: "2 spaces" },
    { value: JsonIndent.FOUR, label: "4 spaces" },
    { value: JsonIndent.TAB, label: "Tabs" },
  ];

  let input: HTMLTextAreaElement | null = $state(null);

  const check = $derived<JsonResult | null>(value.input.trim() === "" ? null : minify_json(value.input));

  function apply(result: JsonResult) {
    if (result.ok) value.input = result.value;
  }

  function show_error() {
    if (!check || check.ok || !check.position || !input) return;
    input.focus();
    input.setSelectionRange(check.position.offset, check.position.offset + 1);
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <Button size="sm" variant="primary" disabled={!check?.ok} onclick={() => apply(format_json(value.input, value.indent))}>
    Format
  </Button>
  <Select size="sm" options={INDENT_OPTIONS} bind:value={value.indent} aria-label="Indent" class="w-28" />
  <Button size="sm" disabled={!check?.ok} onclick={() => apply(minify_json(value.input))}>Minify</Button>
  <div class="flex-1"></div>
  <CopyButton text={value.input} />
</div>

{#if check?.ok}
  <p class="flex items-center gap-1.5 text-ui text-success"><CheckCircleIcon weight="fill" class="size-4" /> Valid JSON</p>
{:else if check}
  <div role="alert" class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-error/10 px-3 py-2 text-ui text-error">
    <span class="min-w-0 flex-1">{check.error}</span>
    {#if check.position}
      <button type="button" class="font-mono text-2xs underline underline-offset-2 hover:opacity-85" onclick={show_error}>
        Line {check.position.line}, column {check.position.column}
      </button>
    {/if}
  </div>
{/if}

<Section title="JSON" flush>
  <TextArea
    bind:value={value.input}
    bind:element={input}
    rows={16}
    aria-label="JSON"
    placeholder={'{ "paste": "JSON here" }'}
  />
</Section>
