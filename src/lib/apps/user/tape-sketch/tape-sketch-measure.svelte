<script lang="ts">
  import { Button, Grabber, IconButton } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { CaretLeft as CaretLeftIcon, CaretRight as CaretRightIcon, Check as CheckIcon } from "phosphor-svelte";
  import { unmeasured_count } from "./edit";
  import type { Editor } from "./editor.svelte";
  import { closure } from "./geometry";
  import { point_map, type Target } from "./model";
  import TapeSketchKeys from "./tape-sketch-keys.svelte";
  import { format_length, input_for } from "./units";

  interface Props {
    editor: Editor;
    target: Target;
  }

  let { editor, target }: Props = $props();

  const sketch = $derived(editor.sketch);
  const unit = $derived(sketch.unit);
  const left = $derived(unmeasured_count(sketch));

  const title = $derived.by(() => {
    if (target.kind === "edge") {
      const index = sketch.paths.findIndex((path) => path.id === target.path);
      return `Shape ${index + 1} · edge ${target.index + 1}`;
    }
    if (target.kind === "dim") return `Dimension ${sketch.dims.findIndex((dim) => dim.id === target.id) + 1}`;
    const path = target.path;
    return `Shape ${sketch.paths.findIndex((each) => each.id === path) + 1} · height`;
  });

  const implied = $derived.by(() => {
    if (target.kind !== "edge") return null;
    const path = sketch.paths.find((each) => each.id === target.path);
    if (!path) return null;
    const check = closure(path, point_map(sketch));
    const hit = check?.implied.find((item) => item.index === target.index);
    return hit && path.lengths[target.index] === null ? hit.value : null;
  });

  function use_implied() {
    if (implied === null) return;
    editor.input = input_for(implied, unit);
    editor.typed = true;
    editor.step(1);
  }
</script>

<section
  class="sheet relative flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 pt-2 pb-3"
  aria-label="Measure {title}"
  {@attach swipe_dismiss({ on_dismiss: () => editor.close_numpad() })}
>
  <Grabber class="-mt-0.5 mb-0.5 @[46rem]:hidden" />
  <div class="flex items-center gap-1">
    <IconButton label="Previous to measure (←)" size="md" class="size-11 pointer-coarse:size-11" onclick={() => editor.step(-1)}>
      <CaretLeftIcon weight="bold" />
    </IconButton>
    <div class="min-w-0 flex-1 text-center">
      <div class="truncate text-ui font-medium">{title}</div>
      <div class="text-2xs text-foreground/65">{left ? `${left} still to measure` : "Everything is measured"}</div>
    </div>
    <IconButton label="Next to measure (→)" size="md" class="size-11 pointer-coarse:size-11" onclick={() => editor.step(1)}>
      <CaretRightIcon weight="bold" />
    </IconButton>
  </div>

  <div class="flex h-12 items-center gap-2 rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] px-3 ring-1 ring-foreground/15 ring-inset">
    <output class="min-w-0 flex-1 truncate text-right font-mono text-2xl tabular-nums" aria-live="polite">
      {#if editor.input}
        <span class={editor.typed ? "" : "text-foreground/65"}>{editor.input}</span>
      {:else}
        <span class="text-foreground/38">?</span>
      {/if}
    </output>
    <span class="font-mono text-ui text-foreground/65">{unit}</span>
  </div>
  {#if implied !== null}
    <Button size="sm" variant="quiet" class="self-center text-primary" onclick={use_implied}>
      The other walls say {format_length(implied, unit)}: use it
    </Button>
  {/if}

  <div class="grid grid-cols-[3fr_1fr] gap-1.5">
    <TapeSketchKeys class="grid-rows-[repeat(4,3rem)]" onpress={(key) => editor.press(key)} />
    <div class="grid grid-rows-[3rem_1fr] gap-1.5">
      <Button variant="secondary" class="h-full rounded-lg pointer-coarse:h-full" tabindex={-1} onclick={() => editor.clear_input()}>Clear</Button>
      <Button variant="primary" class="h-full rounded-lg text-sm pointer-coarse:h-full" tabindex={-1} aria-label="Done (Enter)" onclick={() => editor.close_numpad()}>
        <CheckIcon class="size-6" weight="bold" />
      </Button>
    </div>
  </div>
</section>
