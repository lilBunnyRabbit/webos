<script lang="ts">
  import { IconButton, Input, Select } from "$lib/core/components/ui";
  import { TextItalic as TextItalicIcon } from "phosphor-svelte";
  import { build_face } from "./build";
  import { regular_weight, style_name, type Face, type FontProject } from "./model";

  interface Props {
    project: FontProject;
    sample: string;
  }

  let { project, sample = $bindable() }: Props = $props();

  const family = `font-maker-${crypto.randomUUID()}`;
  let ready = $state(false);
  let picked_weight = $state<number | null>(null);
  let italic = $state(false);

  const face = $derived<Face>({
    weight: project.weights.some((item) => item.weight === picked_weight) ? picked_weight! : regular_weight(project),
    italic: italic && !!project.italic,
  });
  const options = $derived(project.weights.map((item) => ({ value: String(item.weight), label: style_name(item.weight, false) })));

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
  <p
    class="preview min-h-12 overflow-hidden rounded-md bg-background-darker px-3 py-2 text-2xl leading-tight @md:text-3xl break-words text-foreground ring-1 ring-foreground/8 ring-inset"
    style:font-family={ready ? `"${family}", var(--font-sans)` : "var(--font-sans)"}
    aria-live="off"
  >
    {sample || " "}
  </p>
  <p class="text-2xs text-foreground/65">Letters you haven't drawn show in the system font.</p>
</div>
