<script lang="ts">
  import { Button, CopyButton, Section, Segmented, Switch, Textarea } from "$lib/core/components/ui";
  import { ArrowsDownUp as ArrowsDownUpIcon } from "phosphor-svelte";
  import { decode_base64, encode_base64 } from "../base64";
  import { DIRECTION_OPTIONS, Direction, type DevToolsState } from "../tools";

  let { value = $bindable() }: { value: DevToolsState["base64"] } = $props();

  const result = $derived(
    value.direction === Direction.ENCODE
      ? { ok: true, value: encode_base64(value.input, value.url_safe), error: undefined }
      : decode_base64(value.input)
  );

  function swap() {
    if (!result.ok) return;
    value.input = result.value;
    value.direction = value.direction === Direction.ENCODE ? Direction.DECODE : Direction.ENCODE;
  }
</script>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
  <Segmented label="Direction" options={DIRECTION_OPTIONS} bind:value={value.direction} />
  {#if value.direction === Direction.ENCODE}
    <label class="flex items-center gap-2 text-ui">
      <Switch bind:checked={value.url_safe} />
      URL-safe
    </label>
  {:else}
    <span class="text-ui text-foreground/65">Reads both alphabets, padding optional</span>
  {/if}
</div>

<Section title={value.direction === Direction.ENCODE ? "Text" : "Base64"} flush>
  <Textarea mono
    bind:value={value.input}
    rows={6}
    aria-label="Input"
    placeholder={value.direction === Direction.ENCODE ? "Text to encode" : "Base64 to decode"}
  />
</Section>

<Section title={value.direction === Direction.ENCODE ? "Base64" : "Text"} flush>
  {#snippet actions()}
    <Button size="sm" variant="quiet" disabled={!result.ok || value.input === ""} onclick={swap}>
      <ArrowsDownUpIcon weight="bold" />Use as input
    </Button>
    <CopyButton text={result.ok ? result.value : ""} />
  {/snippet}
  {#if result.ok}
    <Textarea mono value={result.value} rows={6} readonly aria-label="Output" />
  {:else}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{result.error}</p>
  {/if}
</Section>
