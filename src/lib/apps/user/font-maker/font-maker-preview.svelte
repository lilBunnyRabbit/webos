<script lang="ts">
  import { Button, IconButton, Input, Select, Switch } from "$lib/core/components/ui";
  import { ArrowCounterClockwise as ArrowCounterClockwiseIcon, TextItalic as TextItalicIcon } from "phosphor-svelte";
  import { auto_kern_of, build_face } from "./build";
  import { KERN_STEP } from "./kerning";
  import { caret_at_point } from "$kit/utils/caret";
  import { kern_adjustment, regular_weight, set_auto_kerning, set_kern_adjustment, style_name, type Face, type FontProject } from "./model";

  interface Props {
    project: FontProject;
    sample: string;
    onchange: (change: (project: FontProject) => FontProject) => void;
  }

  interface Gap {
    first: string;
    second: string;
    at: number;
  }

  let { project, sample = $bindable(), onchange }: Props = $props();

  const family = `font-maker-${crypto.randomUUID()}`;
  // One highlight shared by every Font Maker window; each adds and removes only its own range.
  const HIGHLIGHT = "font-maker-kern";
  let ready = $state(false);
  let picked_weight = $state<number | null>(null);
  let italic = $state(false);
  let line = $state<HTMLElement>();
  let picked = $state<Gap | null>(null);

  const face = $derived<Face>({
    weight: project.weights.some((item) => item.weight === picked_weight) ? picked_weight! : regular_weight(project),
    italic: italic && !!project.italic,
  });
  const options = $derived(project.weights.map((item) => ({ value: String(item.weight), label: style_name(item.weight, false) })));
  const text = $derived(sample || " ");
  const gap = $derived(locate(picked, text));
  const pair = $derived(picked ? picked.first + picked.second : "");
  const auto = $derived(project.kerning?.auto ?? false);
  const manual = $derived(pair ? kern_adjustment(project, pair) : 0);
  const automatic = $derived(picked ? auto_kern_of(project, face, picked.first, picked.second) : 0);

  function gap_at(value: string, at: number): Gap | null {
    const first = [...value.slice(0, at)].at(-1);
    const second = [...value.slice(at)][0];
    if (!first || !second || /\s/u.test(first) || /\s/u.test(second)) return null;
    return { first, second, at };
  }

  function locate(target: Gap | null, value: string): Gap | null {
    if (!target) return null;
    const here = gap_at(value, target.at);
    if (here && here.first === target.first && here.second === target.second) return here;
    const index = value.indexOf(target.first + target.second);
    return index < 0 ? null : { ...target, at: index + target.first.length };
  }

  function pick(event: MouseEvent) {
    const caret = caret_at_point(event.clientX, event.clientY);
    if (!caret || caret.node !== line?.firstChild) return;
    picked = gap_at(text, caret.offset);
  }

  function step_gap(direction: -1 | 1) {
    const chars = [...text];
    let index = gap ? [...text.slice(0, gap.at)].length : direction > 0 ? 0 : chars.length;
    for (let tries = 0; tries < chars.length; tries++) {
      index += direction;
      if (index <= 0 || index >= chars.length) return;
      const next = gap_at(text, chars.slice(0, index).join("").length);
      if (next) {
        picked = next;
        return;
      }
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step_gap(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Escape" && picked) {
      event.stopPropagation();
      picked = null;
    }
  }

  const adjust = (delta: number) => onchange((value) => set_kern_adjustment(value, pair, kern_adjustment(value, pair) + delta));

  $effect(() => {
    const node = line?.firstChild;
    if (!gap || !(node instanceof Text) || node.data !== text) return;
    const range = new Range();
    range.setStart(node, gap.at - gap.first.length);
    range.setEnd(node, gap.at + gap.second.length);
    const highlight = CSS.highlights.get(HIGHLIGHT) ?? new Highlight();
    CSS.highlights.set(HIGHLIGHT, highlight);
    highlight.add(range);
    return () => {
      highlight.delete(range);
      if (!highlight.size) CSS.highlights.delete(HIGHLIGHT);
    };
  });

  $effect(() => {
    const snapshot = project;
    const chosen = face;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = new FontFace(family, build_face(snapshot, chosen));
        await next.load();
        if (cancelled) return;
        for (const old of document.fonts) if (old.family === family) document.fonts.delete(old);
        document.fonts.add(next);
        ready = true;
      } catch (reason) {
        console.warn("[font-maker] Preview font didn't load", reason);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => () => {
    for (const old of document.fonts) if (old.family === family) document.fonts.delete(old);
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex gap-2">
    <Input size="sm" class="min-w-0 flex-1" bind:value={sample} aria-label="Sample text" placeholder="Type a sample" />
    {#if options.length > 1}
      <Select size="sm" class="w-28 shrink-0" aria-label="Preview weight" {options} value={String(face.weight)} onchange={(event) => (picked_weight = Number(event.currentTarget.value))} />
    {/if}
    {#if project.italic}
      <IconButton label="Italic" size="sm" class="shrink-0" pressed={face.italic} onclick={() => (italic = !italic)}><TextItalicIcon weight="bold" /></IconButton>
    {/if}
  </div>
  <div
    bind:this={line}
    role="textbox"
    aria-readonly="true"
    aria-label="Sample in your font. Tap between two letters, or use the arrow keys, to kern them"
    tabindex="0"
    class="preview min-h-12 cursor-text overflow-hidden rounded-md bg-field px-3 py-2 text-2xl leading-tight @md:text-3xl break-words whitespace-pre-wrap text-foreground shadow-recessed ring-1 ring-hairline-strong ring-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail"
    style:font-family={ready ? `"${family}", var(--font-sans)` : "var(--font-sans)"}
    onclick={pick}
    {onkeydown}
  >{text}</div>
  <div class="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 text-ui">
    <label class="flex items-center gap-2 pointer-coarse:min-h-11">
      <Switch checked={auto} onchange={(event) => onchange((value) => set_auto_kerning(value, event.currentTarget.checked))} />
      <span>Auto kerning</span>
    </label>
    {#if picked}
      <span class="flex items-center gap-1">
        <span class="w-8 text-center text-base" aria-label="Pair">{picked.first}{picked.second}</span>
        <IconButton label="Tighter" size="sm" class="text-base pointer-coarse:size-11" onclick={() => adjust(-KERN_STEP)}>−</IconButton>
        <span class="w-10 text-center font-mono text-2xs tabular-nums" aria-label="Kerning">{automatic + manual}</span>
        <IconButton label="Looser" size="sm" class="text-base pointer-coarse:size-11" onclick={() => adjust(KERN_STEP)}>+</IconButton>
      </span>
      {#if auto}
        <span class="text-2xs text-foreground/65">Auto {automatic}</span>
      {/if}
      {#if manual}
        <Button size="sm" variant="quiet" class="pointer-coarse:h-11" onclick={() => onchange((value) => set_kern_adjustment(value, pair, 0))}><ArrowCounterClockwiseIcon weight="bold" />Reset</Button>
      {/if}
    {:else}
      <span class="text-2xs text-foreground/65">Tap between two letters to kern them.</span>
    {/if}
  </div>
  <p class="text-2xs text-foreground/65">Letters you haven't drawn show in the system font.</p>
</div>

<style>
  .preview {
    font-kerning: normal;
  }

  .preview::highlight(font-maker-kern) {
    background-color: color-mix(in oklch, var(--primary) 25%, transparent);
  }
</style>
