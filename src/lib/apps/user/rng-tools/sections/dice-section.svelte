<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Input, Section } from "$lib/core/components/ui";
  import { DiceFive as DiceFiveIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { z } from "zod";
  import { DICE_PRESETS, dice_roll_schema, parse_dice, roll_terms, type DiceRoll, type TermRoll } from "../dice";

  const HISTORY_LIMIT = 50;

  const { storage } = get_app_context();
  const notation = storage.persisted("dice.notation", "3d6+2", z.string());
  const history = storage.window<DiceRoll[]>("dice_history", [], z.array(dice_roll_schema));

  const parsed = $derived(parse_dice(notation.value));
  const latest = $derived(history.value[0] ?? null);

  function roll() {
    if (!parsed.ok) return;
    history.value = [roll_terms(parsed.terms), ...history.value].slice(0, HISTORY_LIMIT);
  }

  function roll_preset(preset: string) {
    notation.value = preset;
    roll();
  }

  function describe_term({ term, rolls }: TermRoll, index: number): string {
    const sign = term.sign < 0 ? "- " : index > 0 ? "+ " : "";
    return term.kind === "constant" ? `${sign}${term.value}` : `${sign}[${rolls.join(", ")}]`;
  }
</script>

<Section title="Roll" description="Dice notation: 3d6+2, d20-1, 2d8+1d4. d% is a d100.">
  <form
    class="flex flex-col gap-3 p-4"
    onsubmit={(event) => {
      event.preventDefault();
      roll();
    }}
  >
    <div class="flex gap-2">
      <Input aria-label="Dice" class="font-mono" autocomplete="off" spellcheck="false" bind:value={notation.value} />
      <Button type="submit" variant="primary" disabled={!parsed.ok}><DiceFiveIcon weight="bold" />Roll</Button>
    </div>
    {#if !parsed.ok}<p role="alert" class="text-ui text-error">{parsed.error}</p>{/if}
    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Presets">
      {#each DICE_PRESETS as preset (preset)}
        <Button size="sm" class="font-mono" onclick={() => roll_preset(preset)}>{preset}</Button>
      {/each}
    </div>
  </form>
</Section>

{#if latest}
  <Section title="Result">
    <output class="flex flex-col items-center gap-1 p-6 text-center" aria-live="polite">
      <span class="font-mono text-5xl font-semibold tabular-nums text-primary">{latest.total}</span>
      <span class="font-mono text-ui text-foreground/65">{latest.notation}</span>
      <span class="font-mono text-ui break-all">{latest.terms.map(describe_term).join(" ")}</span>
    </output>
  </Section>

  <Section title="History" description="Rolls in this window, newest first.">
    {#snippet actions()}
      <Button size="sm" variant="quiet" onclick={() => (history.value = [])}><TrashIcon />Clear</Button>
    {/snippet}
    <ol class="max-h-72 overflow-y-auto">
      {#each history.value as entry (entry.id)}
        <li class="flex items-baseline gap-3 px-4 py-2 font-mono text-ui">
          <span class="w-20 shrink-0 truncate text-foreground/65">{entry.notation}</span>
          <span class="min-w-0 flex-1 truncate text-foreground/80">{entry.terms.map(describe_term).join(" ")}</span>
          <span class="shrink-0 font-semibold tabular-nums">{entry.total}</span>
        </li>
      {/each}
    </ol>
  </Section>
{/if}
