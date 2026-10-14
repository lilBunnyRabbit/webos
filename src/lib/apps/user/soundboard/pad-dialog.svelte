<script lang="ts" module>
  import type { Pad } from "./board";

  export type PadEdit = { action: "save"; pad: Pad } | { action: "delete" };
</script>

<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { Button, IconButton, Input, Select, Slider, Switch } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Play as PlayIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { PAD_COLORS, type PadColor } from "./board";
  import { SWATCH } from "./colors";

  let {
    pad,
    keys,
    preview,
    resolve,
  }: DialogProps<PadEdit> & { pad: Pad; keys: string[]; preview: (pad: Pad) => void } = $props();

  let draft = $state(untrack(() => ({ ...pad })));
  const NONE = "none";
  const key_options = $derived([{ value: NONE, label: "None" }, ...keys.map((key) => ({ value: key, label: key.toUpperCase() }))]);
  let key = $state(untrack(() => pad.key ?? NONE));

  function submit(event: SubmitEvent) {
    event.preventDefault();
    resolve({ action: "save", pad: { ...draft, label: draft.label.trim() || pad.label, key: key === NONE ? null : key } });
  }

  const color_label = (color: PadColor) => color[0].toUpperCase() + color.slice(1);
</script>

<form class="grid w-[min(24rem,calc(100cqw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover" onsubmit={submit}>
  <h2 class="text-sm font-semibold">Edit pad</h2>

  <label class="grid gap-1.5 text-ui text-foreground/80">
    Label
    <Input bind:value={draft.label} size="lg" maxlength={40} spellcheck="false" />
  </label>

  <fieldset class="grid gap-1.5">
    <legend class="mb-1.5 text-ui text-foreground/80">Colour</legend>
    <div class="flex flex-wrap gap-2">
      {#each PAD_COLORS as color (color)}
        <label class="relative grid size-8 cursor-pointer place-items-center rounded-full pointer-coarse:size-9" title={color_label(color)}>
          <input type="radio" name="color" value={color} bind:group={draft.color} class="peer sr-only" />
          <span
            class={cn(
              "size-6 rounded-full ring-offset-2 ring-offset-background-lighter transition-shadow peer-checked:ring-2 peer-focus-visible:ring-2 peer-focus-visible:ring-cottontail",
              SWATCH[color]
            )}
          ></span>
          <span class="sr-only">{color_label(color)}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <label class="grid gap-1 text-ui text-foreground/80">
    <span class="flex items-center justify-between">Volume <span class="font-mono text-2xs tabular-nums">{Math.round(draft.volume * 100)}%</span></span>
    <Slider min={0} max={1} step={0.05} bind:value={draft.volume} size="sm" />
  </label>

  <div class="flex items-center justify-between gap-4 text-ui text-foreground/80">
    <label for="pad-key">Key</label>
    <Select id="pad-key" size="sm" options={key_options} bind:value={key} class="w-24" />
  </div>

  <label class="flex items-center justify-between gap-4 text-ui text-foreground/80">
    <span>Loop <span class="text-foreground/65">· plays until pressed again</span></span>
    <Switch bind:checked={draft.loop} />
  </label>

  <div class="flex flex-wrap items-center gap-2">
    <IconButton label="Delete pad" class="text-error hover:text-error" onclick={() => resolve({ action: "delete" })}><TrashIcon weight="bold" /></IconButton>
    <Button variant="quiet" onclick={() => preview({ ...draft, loop: false })}><PlayIcon weight="fill" /> Preview</Button>
    <span class="flex-1"></span>
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit">Save</Button>
  </div>
</form>
