<script lang="ts">
  import { CHAR_SET_LABELS, CHAR_SETS, set_characters } from "./charsets";
  import FontMakerGlyph from "./font-maker-glyph.svelte";
  import { BOX, BOX_HEIGHT, BOX_WIDTH, is_drawn, stroke_width, type FontProject } from "./model";

  interface Props {
    project: FontProject;
    selected: string;
    onselect: (char: string) => void;
  }

  let { project, selected, onselect }: Props = $props();
  const uid = $props.id();
  const width = $derived(stroke_width(project));

  const sections = $derived.by(() => {
    const seen = new Set<string>();
    return CHAR_SETS.filter((set) => project.sets.includes(set)).map((set) => {
      const chars = set_characters(set).filter((char) => !seen.has(char));
      chars.forEach((char) => seen.add(char));
      return { set, chars, drawn: chars.filter((char) => is_drawn(project.glyphs[char])).length };
    });
  });
</script>

<svg class="absolute size-0" aria-hidden="true">
  <filter id="invert-{uid}" color-interpolation-filters="sRGB">
    <feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" />
  </filter>
</svg>

<div class="flex flex-col gap-4 p-3">
  {#each sections as section (section.set)}
    <section aria-label={CHAR_SET_LABELS[section.set]}>
      <h2 class="mb-1.5 flex items-baseline gap-2 px-0.5 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
        {CHAR_SET_LABELS[section.set]}
        <span class="font-mono tabular-nums normal-case">{section.drawn} / {section.chars.length}</span>
      </h2>
      <div class="cells grid gap-1.5">
        {#each section.chars as char (char)}
          {@const glyph = project.glyphs[char]}
          {@const drawn = is_drawn(glyph)}
          <button
            type="button"
            class={[
              "cell relative aspect-[5/6] overflow-hidden rounded-md text-left ring-1 transition-colors duration-150 ring-inset",
              selected === char ? "bg-primary/14 ring-primary/70" : "bg-background-darker ring-foreground/8 hover:bg-foreground/6",
            ]}
            aria-label="{char}{drawn ? '' : ', empty'}"
            aria-current={selected === char ? "true" : undefined}
            onclick={() => onselect(char)}
          >
            <span class={["absolute top-0.5 left-1 text-2xs", drawn ? "text-foreground/45" : "text-foreground/80"]}>{char}</span>
            {#if drawn && glyph}
              <FontMakerGlyph strokes={glyph.strokes} {width} class="absolute inset-0 size-full" />
            {:else if glyph?.guide}
              {@const mask = `guide-${uid}-${char.codePointAt(0)}`}
              <svg viewBox="{BOX.left} {-BOX.top} {BOX_WIDTH} {BOX_HEIGHT}" class="absolute inset-0 size-full" aria-hidden="true">
                <mask id={mask} maskUnits="userSpaceOnUse" x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT}>
                  <image href={glyph.guide} x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT} preserveAspectRatio="none" filter="url(#invert-{uid})" />
                </mask>
                <rect x={BOX.left} y={-BOX.top} width={BOX_WIDTH} height={BOX_HEIGHT} class="fill-foreground" opacity="0.45" mask="url(#{mask})" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .cells {
    grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
  }

  @container (width >= 30rem) {
    .cells {
      grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr));
    }
  }

</style>
