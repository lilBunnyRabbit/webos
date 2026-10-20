<script lang="ts">
  import { Input } from "$lib/core/components/ui";
  import { build_font, drawn_characters } from "./build";
  import type { FontProject } from "./model";

  interface Props {
    project: FontProject;
    sample: string;
  }

  let { project, sample = $bindable() }: Props = $props();

  const family = `font-maker-${crypto.randomUUID()}`;
  let ready = $state(false);
  const empty = $derived(drawn_characters(project).length === 0);

  $effect(() => {
    const snapshot = project;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = new FontFace(family, build_font(snapshot));
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
  <Input size="sm" bind:value={sample} aria-label="Sample text" placeholder="Type a sample" />
  <p
    class="preview min-h-12 overflow-hidden rounded-md bg-background-darker px-3 py-2 text-3xl leading-tight break-words text-foreground ring-1 ring-foreground/8 ring-inset"
    style:font-family={ready ? `"${family}", var(--font-sans)` : "var(--font-sans)"}
    aria-live="off"
  >
    {sample || " "}
  </p>
  {#if empty}<p class="text-2xs text-foreground/65">Letters you haven't drawn show in the system font.</p>{/if}
</div>
