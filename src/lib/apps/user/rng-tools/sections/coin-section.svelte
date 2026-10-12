<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Button, Section } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowCounterClockwise as ResetIcon, Coin as CoinIcon } from "phosphor-svelte";
  import { z } from "zod";
  import { random_bool } from "../random";

  const RECENT_LIMIT = 30;

  const { storage } = get_app_context();
  const tally = storage.persisted(
    "coin.tally",
    { heads: 0, tails: 0 },
    z.object({ heads: z.number().int().nonnegative(), tails: z.number().int().nonnegative() })
  );

  let recent = $state.raw<boolean[]>([]);

  const total = $derived(tally.value.heads + tally.value.tails);
  const latest = $derived(recent[0]);
  const counts = $derived([
    { label: "Heads", count: tally.value.heads, share: true },
    { label: "Tails", count: tally.value.tails, share: true },
    { label: "Total", count: total, share: false },
  ]);

  function flip(times: number) {
    const flips = Array.from({ length: times }, () => random_bool());
    const heads = flips.filter(Boolean).length;
    tally.value = { heads: tally.value.heads + heads, tails: tally.value.tails + times - heads };
    recent = [...flips.reverse(), ...recent].slice(0, RECENT_LIMIT);
  }

  function percent(count: number): string {
    return total === 0 ? "–" : `${((count / total) * 100).toFixed(1)}%`;
  }
</script>

<Section flush>
  <div class="flex flex-col items-center gap-4 rounded-xl bg-background-light p-6 ring-1 ring-foreground/8">
    <output aria-live="polite" class="flex flex-col items-center gap-2">
      <span
        class={cn(
          "grid size-24 place-items-center rounded-full ring-2",
          latest === undefined ? "text-foreground/35 ring-foreground/15" : "text-primary ring-primary/60"
        )}
      >
        <CoinIcon class="size-12" weight={latest === undefined ? "regular" : "duotone"} />
      </span>
      <span class="text-2xl font-semibold">{latest === undefined ? "Flip the coin" : latest ? "Heads" : "Tails"}</span>
    </output>
    <div class="flex flex-wrap justify-center gap-2">
      <Button variant="primary" size="lg" onclick={() => flip(1)}>Flip</Button>
      <Button size="lg" onclick={() => flip(10)}>Flip 10</Button>
    </div>
    {#if recent.length > 0}
      <p class="max-w-full break-all text-center font-mono text-ui text-foreground/65" aria-label="Recent flips, newest first">
        {recent.map((heads) => (heads ? "H" : "T")).join(" ")}
      </p>
    {/if}
  </div>
</Section>

<Section title="Tally" description="Every flip, kept until you reset it.">
  {#snippet actions()}
    <Button size="sm" variant="quiet" disabled={total === 0} onclick={() => (tally.value = { heads: 0, tails: 0 })}><ResetIcon />Reset</Button>
  {/snippet}
  <dl class="grid grid-cols-3 divide-x divide-foreground/8 text-center">
    {#each counts as { label, count, share } (label)}
      <div class="flex flex-col gap-0.5 p-4">
        <dt class="text-2xs uppercase tracking-wide text-foreground/65">{label}</dt>
        <dd class="font-mono text-xl font-semibold tabular-nums">{count}</dd>
        {#if share}<dd class="font-mono text-2xs tabular-nums text-foreground/65">{percent(count)}</dd>{/if}
      </div>
    {/each}
  </dl>
</Section>
