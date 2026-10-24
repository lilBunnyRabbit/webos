<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Eraser as EraserIcon, X as XIcon } from "phosphor-svelte";
  import { Mark } from "./game";
  import type { Ink } from "./puzzle";
  import type { Snippet } from "svelte";

  const INK_NAMES: Record<Ink, string> = {
    foreground: "Ink",
    primary: "Primary",
    success: "Green",
    warning: "Amber",
    error: "Red",
    info: "Blue",
  };

  let {
    value = $bindable(),
    palette,
    extra,
    disabled,
    size = "sm",
    class: class_name,
  }: {
    value: Mark;
    palette: readonly Ink[];
    extra: "cross" | "erase";
    disabled?: (color: number) => boolean;
    size?: "sm" | "md";
    class?: string;
  } = $props();

  const name = $props.id();
  const extra_value = $derived(extra === "cross" ? Mark.CROSSED : Mark.EMPTY);
</script>

{#snippet option(option_value: number, label: string, is_disabled: boolean, content: Snippet)}
  <label
    title={label}
    class={cn(
      "relative grid cursor-pointer place-items-center rounded-sm duration-150",
      size === "sm" ? "size-6 pointer-coarse:size-8" : "size-8 pointer-coarse:size-9",
      "text-foreground/80 transition-[color,background-color,box-shadow] hover:text-foreground has-checked:bg-background-lighter has-checked:text-foreground has-checked:shadow-control",
      "has-focus-visible:outline-2 has-focus-visible:outline-cottontail",
      is_disabled && "pointer-events-none opacity-38"
    )}
  >
    <input type="radio" class="sr-only" {name} value={option_value} bind:group={value} disabled={is_disabled} aria-label={label} />
    {@render content()}
  </label>
{/snippet}

<div role="radiogroup" aria-label="Colour" class={cn("inline-flex gap-0.5 rounded-md bg-field p-0.5 shadow-recessed", class_name)}>
  {#each palette as ink, index (ink)}
    {@const color = index + 1}
    {#snippet swatch()}
      <span class="size-3.5 rounded-[3px] ring-1 ring-foreground/20" style:background="var(--{ink})"></span>
    {/snippet}
    {@render option(color, `${INK_NAMES[ink]} (${color})`, disabled?.(color) ?? false, swatch)}
  {/each}
  {#snippet extra_icon()}
    {#if extra === "cross"}<XIcon weight="bold" class="size-3.5" />{:else}<EraserIcon weight="bold" class="size-3.5" />{/if}
  {/snippet}
  {@render option(extra_value, extra === "cross" ? "Cross (X)" : "Erase", false, extra_icon)}
</div>
