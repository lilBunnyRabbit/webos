<script lang="ts">
  import { Badge, Button, Slider, Spinner, Switch } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import { CODECS, type CodecFormat } from "$kit/utils/codecs/formats";
  import { DownloadSimple as DownloadSimpleIcon, Eye as EyeIcon } from "phosphor-svelte";
  import type { LabResult } from "./encode-job";
  import { share_of } from "./heatmap";
  import type { FormatSettings } from "./settings";

  interface Props {
    format: CodecFormat;
    settings: FormatSettings;
    result: LabResult | null;
    stale: boolean;
    busy: boolean;
    error: string | null;
    source_size: number;
    shown: boolean;
    onshow: () => void;
    onsave: () => void;
  }

  let { format, settings = $bindable(), result, stale, busy, error, source_size, shown, onshow, onsave }: Props = $props();

  const info = $derived(CODECS[format]);
  const id = $props.id();
</script>

{#snippet stat(label: string, value: string)}
  <div class="flex min-w-0 flex-col gap-0.5 rounded-md bg-foreground/4 px-2 py-1.5">
    <dt class="text-2xs text-foreground/65">{label}</dt>
    <dd class="truncate font-mono text-ui tabular-nums">{value}</dd>
  </div>
{/snippet}

<article class={["flex flex-col gap-2.5 rounded-xl bg-background-light p-3 ring-1", shown ? "ring-primary/60" : "ring-foreground/8"]} aria-labelledby="{id}-title">
  <header class="flex flex-wrap items-center gap-2">
    <h3 id="{id}-title" class="text-sm font-semibold">{info.label}</h3>
    {#if busy}
      <Spinner label="Encoding {info.label}" class="size-3.5" />
    {:else if error}
      <Badge tone="error">Failed</Badge>
    {:else if stale && result}
      <Badge tone="warning">Settings changed</Badge>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      <Button size="sm" variant="quiet" pressed={shown} disabled={!result} onclick={onshow} class="pointer-coarse:h-11">
        <EyeIcon weight="bold" /> Show
      </Button>
      <Button size="sm" disabled={!result || stale} onclick={onsave} class="pointer-coarse:h-11">
        <DownloadSimpleIcon weight="bold" /> Save
      </Button>
    </div>
  </header>

  {#if error}
    <p class="text-2xs text-error">{error}</p>
  {/if}

  <dl class="grid grid-cols-2 gap-1.5 @lg:grid-cols-4 @3xl:grid-cols-2">
    {@render stat("Size", result ? format_bytes(result.blob.size) : "–")}
    {@render stat("Of source", result ? share_of(source_size, result.blob.size) : "–")}
    {@render stat("Time", result ? `${Math.round(result.ms)} ms` : "–")}
    {@render stat("SSIM", result ? result.ssim.score.toFixed(4) : "–")}
  </dl>

  <div class="flex flex-col gap-1">
    {#if info.quality !== null}
      <label class={["flex items-center gap-2 text-ui", settings.lossless && "opacity-38"]}>
        <span class="w-16 shrink-0">Quality</span>
        <Slider size="sm" min={1} max={100} bind:value={settings.quality} disabled={settings.lossless} class="min-w-0 flex-1 pointer-coarse:h-11" />
        <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{settings.quality}</span>
      </label>
    {/if}
    {#if info.effort}
      <label class="flex items-center gap-2 text-ui" title={info.effort.slower_up ? "Higher is slower and smaller" : "Higher is faster and larger"}>
        <span class="w-16 shrink-0">{info.effort.label}</span>
        <Slider size="sm" min={info.effort.min} max={info.effort.max} bind:value={settings.effort} class="min-w-0 flex-1 pointer-coarse:h-11" />
        <span class="w-8 text-right font-mono text-2xs text-foreground/80 tabular-nums">{settings.effort}</span>
      </label>
    {/if}
    {#if info.lossless}
      <label class="flex min-h-8 items-center justify-between gap-2 text-ui pointer-coarse:min-h-11">
        Lossless
        <Switch bind:checked={settings.lossless} />
      </label>
    {/if}
  </div>
</article>
