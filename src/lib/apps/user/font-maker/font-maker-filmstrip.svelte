<script lang="ts">
  import FontMakerGlyph from "./font-maker-glyph.svelte";
  import { stroke_width, type FontProject } from "./model";

  interface Props {
    project: FontProject;
    characters: readonly string[];
    selected: string;
    onselect: (char: string) => void;
  }

  let { project, characters, selected, onselect }: Props = $props();

  const width = $derived(stroke_width(project));
  let strip = $state<HTMLElement>();
  let placed = false;

  $effect(() => {
    const tile = strip?.querySelector<HTMLElement>(`[data-char="${CSS.escape(selected)}"]`);
    if (!strip || !tile) return;
    strip.scrollTo({ left: tile.offsetLeft - (strip.clientWidth - tile.offsetWidth) / 2, behavior: placed ? "smooth" : "instant" });
    placed = true;
  });
</script>

<div bind:this={strip} class="strip relative flex shrink-0 snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain py-1" role="toolbar" aria-label="Characters">
  {#each characters as char (char)}
    {@const strokes = project.glyphs[char]?.strokes ?? []}
    <button
      type="button"
      data-char={char}
      class={[
        "relative h-12 w-10 shrink-0 snap-center overflow-hidden rounded-md ring-1 transition-colors duration-150 ring-inset",
        selected === char ? "bg-primary/14 ring-primary/70" : "bg-background-darker ring-foreground/8 hover:bg-foreground/6",
      ]}
      aria-label="{char}{strokes.length ? '' : ', empty'}"
      aria-current={selected === char ? "true" : undefined}
      onclick={() => onselect(char)}
    >
      <FontMakerGlyph {strokes} {width} ghost={{ char, metrics: project.metrics }} class="absolute inset-0 size-full" />
    </button>
  {/each}
</div>

<style>
  .strip {
    scrollbar-width: thin;
    padding-inline: calc(50% - 1.25rem);
  }
</style>
