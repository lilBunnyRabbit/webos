<script lang="ts">
  import { Button } from "$lib/core/components/ui";
  import { format_time } from "$kit/games";
  import { DownloadSimple as DownloadSimpleIcon } from "phosphor-svelte";
  import { Outcome, type WordResult } from "./game";
  import SketchPad from "./sketch-pad.svelte";

  let { results, onsave }: { results: readonly WordResult[]; onsave: (result: WordResult) => void } = $props();

  function verdict(result: WordResult): string {
    if (result.outcome === Outcome.RECOGNISED) return `Recognised in ${format_time(result.ms ?? 0, { tenths: true })}`;
    const said = result.guesses.length ? `AI said ${result.guesses[0]}` : "No guess";
    return `${result.outcome === Outcome.SKIPPED ? "Skipped" : "Missed"} · ${said}`;
  }
</script>

<ul class="mx-auto grid max-w-4xl grid-cols-2 gap-3 @xl:grid-cols-3" aria-label="Your drawings">
  {#each results as result, i (i)}
    <li class="flex min-w-0 flex-col gap-2 rounded-lg bg-background-light p-2 ring-1 ring-foreground/8">
      <div class="overflow-hidden rounded-md bg-background-darker">
        <SketchPad strokes={result.strokes} />
      </div>
      <div class="flex min-w-0 items-center gap-2 px-1">
        <div class="min-w-0 flex-1">
          <p class="truncate text-ui font-medium">{result.word}</p>
          <p class={["font-mono text-2xs tabular-nums", result.outcome === Outcome.RECOGNISED ? "text-success" : "text-foreground/65"]}>
            {verdict(result)}
          </p>
        </div>
        <Button size="sm" variant="quiet" aria-label="Save {result.word} as PNG" disabled={result.strokes.length === 0} onclick={() => onsave(result)}>
          <DownloadSimpleIcon weight="bold" /> <span class="hidden @2xl:inline">Save</span>
        </Button>
      </div>
    </li>
  {/each}
</ul>
