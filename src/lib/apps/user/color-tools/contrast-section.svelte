<script lang="ts">
  import { Badge, Button, Section } from "$lib/core/components/ui";
  import { ArrowsDownUp as ArrowsDownUpIcon, Check as CheckIcon, X as XIcon } from "phosphor-svelte";
  import { contrast_ratio, to_hex, type Color } from "./color";
  import ColorField from "./color-field.svelte";
  import { CONTRAST_LEVELS, format_ratio, passes } from "./contrast";
  import { format_color, parse_css } from "./models";

  interface Props {
    color: Color;
    text: string;
    background: string;
    onchange: (color: Color) => void;
  }

  let { color, text, background = $bindable(), onchange }: Props = $props();

  const back = $derived(parse_css(background) ?? parse_css("#ffffff")!);
  const ratio = $derived(contrast_ratio(color, back));

  function swap() {
    const front = color.toString();
    onchange(back);
    background = front;
  }
</script>

<p class="text-ui text-foreground/65">WCAG 2 contrast of text in the current colour on a background, as the screen shows them.</p>

<div class="flex flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10" style:background-color={to_hex(back)} style:color={to_hex(color)}>
  <div class="flex flex-col gap-1 px-5 py-6">
    <p class="text-2xl font-semibold">Large text, 24 px</p>
    <p class="text-base">Body text at 16 px: the quick brown rabbit hops over the lazy fox.</p>
    <p class="text-ui">Small print at 13 px, where low contrast hurts first.</p>
  </div>
</div>

<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
  <p class="font-mono text-3xl font-semibold tabular-nums" aria-live="polite">{format_ratio(ratio)}</p>
  <div class="flex flex-wrap gap-1.5">
    {#each CONTRAST_LEVELS as level (level.id)}
      {@const ok = passes(ratio, level)}
      <Badge tone={ok ? "success" : "error"}>
        {#if ok}<CheckIcon weight="bold" />{:else}<XIcon weight="bold" />{/if}
        {level.label}
        <span class="sr-only">{ok ? "passes" : "fails"}, needs {level.min}:1 for {level.detail.toLowerCase()}</span>
      </Badge>
    {/each}
  </div>
</div>

<Section title="Colours" flush>
  {#snippet actions()}
    <Button size="sm" variant="quiet" onclick={swap}><ArrowsDownUpIcon weight="bold" />Swap</Button>
  {/snippet}
  <div class="grid gap-3 @md:grid-cols-2">
    <div class="flex flex-col gap-1">
      <span class="text-2xs font-medium text-foreground/80">Text (the current colour)</span>
      <ColorField {color} {text} label="Text colour" {onchange} size="sm" />
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-2xs font-medium text-foreground/80">Background</span>
      <ColorField color={back} text={format_color(back)} label="Background colour" onchange={(next) => (background = next.toString())} size="sm" />
    </div>
  </div>
</Section>

<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ui">
  {#each CONTRAST_LEVELS as level (level.id)}
    <dt class="font-medium">{level.label}</dt>
    <dd class="text-foreground/65">{level.detail}, at least {level.min}:1</dd>
  {/each}
</dl>
