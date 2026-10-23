<script lang="ts">
  import { Input, Spinner, Toolbar } from "$lib/core/components/ui";
  import { MagnifyingGlass as MagnifyingGlassIcon } from "phosphor-svelte";
  import { currencies, Scope, wallet } from "./api";
  import type { SectionProps } from "./account.svelte";
  import { COIN_ID, format_coins } from "./format";
  import Gate from "./gate.svelte";
  import Problem from "./problem.svelte";
  import StaleNotice from "./stale-notice.svelte";
  import RefreshButton from "./refresh-button.svelte";
  import { Resource } from "./resource.svelte";
  import { Section } from "./sections";

  let { account, picker, active, onnavigate }: SectionProps = $props();

  let query = $state("");

  const holdings = new Resource(async (max_age) => {
    const [names, entries] = await Promise.all([currencies(), wallet(account.key.value, max_age)]);
    const by_id = new Map(names.data.map((currency) => [currency.id, currency]));
    const rows = entries.data
      .flatMap((entry) => {
        const currency = by_id.get(entry.id);
        return currency ? [{ ...currency, value: entry.value }] : [];
      })
      .sort((a, b) => a.order - b.order);
    return { data: rows, at: entries.at };
  });

  const ready = $derived(account.token.data !== null && account.permissions.includes(Scope.WALLET));

  $effect(() => {
    if (active && ready && account.key.value) void holdings.load();
  });

  const shown = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const rows = holdings.data ?? [];
    return needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
  });
  const format_value = (id: number, value: number) => (id === COIN_ID ? format_coins(value) : value.toLocaleString("en"));
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    {@render picker()}
    <Input size="sm" type="search" bind:value={query} placeholder="Filter currencies" aria-label="Filter currencies" class="max-w-56 min-w-28 flex-1">
      {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
    </Input>
    <span class="flex-1"></span>
    <RefreshButton at={holdings.at} loading={holdings.loading} onrefresh={() => void holdings.load(true)} />
  </Toolbar>

  <div class="min-h-0 flex-1 overflow-auto">
    <Gate {account} scopes={[Scope.WALLET]} onkey={() => onnavigate(Section.KEY)}>
      {#if holdings.error && !holdings.data}
        <Problem error={holdings.error} onretry={() => void holdings.load(true)} onkey={() => onnavigate(Section.KEY)} />
      {:else if holdings.data}
        <div class="mx-auto flex max-w-4xl flex-col gap-4 p-4">
          {#if holdings.error}<StaleNotice error={holdings.error} />{/if}
          {#if shown.length === 0}
            <p class="px-1 text-ui text-foreground/65">{query ? "No currency matches." : "The wallet is empty."}</p>
          {:else}
            <ul class="grid gap-px overflow-hidden rounded-xl bg-hairline shadow-card ring-1 ring-hairline @xl:grid-cols-2">
              {#each shown as row (row.id)}
                <li class="flex items-center gap-3 bg-background-light px-4 py-2.5" title={row.description}>
                  <img src={row.icon} alt="" class="size-7 shrink-0 rounded-sm" loading="lazy" referrerpolicy="no-referrer" />
                  <span class="min-w-0 flex-1 truncate text-ui">{row.name}</span>
                  <span class="shrink-0 font-mono text-ui tabular-nums">{format_value(row.id, row.value)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {:else}
        <div class="grid h-full place-items-center"><Spinner /></div>
      {/if}
    </Gate>
  </div>
</div>
