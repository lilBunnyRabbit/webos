<script lang="ts">
  import { DropSlash as DropSlashIcon, Eyedropper as EyedropperIcon } from "phosphor-svelte";

  interface Props {
    label: string;
    value: string | null;
    swatches: readonly string[];
    none: string;
    start: string;
    onpick: (hex: string | null) => void;
  }

  let { label, value, swatches, none, start, onpick }: Props = $props();

  const custom = $derived(value !== null && !swatches.includes(value));
  const keep_focus = (event: PointerEvent) => event.preventDefault();
  const SWATCH = "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md ring-1 ring-foreground/15 ring-inset focus-visible:outline-2 focus-visible:outline-cottontail pointer-coarse:size-10";
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between gap-2 text-ui">
    <span>{label}</span>
    <span class="font-mono text-2xs text-foreground/65 uppercase">{value ?? none}</span>
  </div>
  <div class="flex flex-wrap gap-1" role="group" aria-label={label}>
    <button type="button" class={[SWATCH, "bg-foreground/4 text-foreground/65", value === null && "ring-2 ring-primary"]} aria-label={none} aria-pressed={value === null} title={none} onpointerdown={keep_focus} onclick={() => onpick(null)}>
      <DropSlashIcon weight="bold" class="size-3.5" />
    </button>
    {#each swatches as swatch (swatch)}
      <button
        type="button"
        class={[SWATCH, value === swatch && "ring-2 ring-primary ring-offset-1 ring-offset-background-light"]}
        style:background={swatch}
        aria-label="{label} {swatch}"
        aria-pressed={value === swatch}
        title={swatch}
        onpointerdown={keep_focus}
        onclick={() => onpick(swatch)}
      ></button>
    {/each}
    <label class={[SWATCH, "relative overflow-hidden", custom ? "ring-2 ring-primary ring-offset-1 ring-offset-background-light" : "bg-foreground/4 text-foreground/65"]} style:background={custom ? value : undefined} title="Any colour…">
      {#if !custom}<EyedropperIcon weight="bold" class="size-3.5" />{/if}
      <input type="color" class="absolute inset-0 cursor-pointer opacity-0" aria-label="{label}: any colour" value={value ?? start} onchange={(event) => onpick(event.currentTarget.value.toLowerCase())} />
    </label>
  </div>
</div>
