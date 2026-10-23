<script lang="ts">
  import { Button, EmptyState, IconButton, Input, Select, Spinner, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { Backpack as BackpackIcon, MagnifyingGlass as MagnifyingGlassIcon, X as XIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { get_items, Gw2Error, Gw2ErrorKind, Scope } from "./api";
  import type { SectionProps } from "./account.svelte";
  import { format_stack } from "./format";
  import Gate from "./gate.svelte";
  import { owned_ids } from "./goals";
  import { load_holdings } from "./holdings";
  import { build_inventory, find_rows, InventorySort, RARITY_COLORS, rarities, type_label, types } from "./inventory";
  import Problem from "./problem.svelte";
  import RefreshButton from "./refresh-button.svelte";
  import { Resource } from "./resource.svelte";
  import { Section } from "./sections";
  import StaleNotice from "./stale-notice.svelte";

  let { account, picker, active, onnavigate, query: initial_query }: SectionProps = $props();

  const PAGE = 300;
  const SORTS = [
    { value: InventorySort.RARITY, label: "Rarest first" },
    { value: InventorySort.NAME, label: "Name" },
    { value: InventorySort.COUNT, label: "Most owned" },
  ];

  const holdings = new Resource(async (max_age) => {
    const result = await load_holdings(account.key.value, account.permissions, max_age);
    return { data: result, at: result.at };
  });
  const items = new Resource(async () => {
    const data = holdings.data;
    return { data: await get_items(owned_ids([...(data?.holdings ?? []), ...(data?.equipped ?? [])])), at: Date.now() };
  });

  let query = $state(untrack(() => initial_query ?? ""));
  let rarity = $state("");
  let type = $state("");
  let sort = $state<InventorySort>(InventorySort.RARITY);
  let shown = $state(PAGE);
  let selected = $state<number | null>(null);

  const ready = $derived(account.token.data !== null && account.permissions.includes(Scope.INVENTORIES));

  $effect(() => {
    if (active && ready && account.key.value) void holdings.load();
  });

  $effect(() => {
    if (holdings.data) void untrack(() => items.load());
  });

  $effect(() => {
    void query;
    void rarity;
    void type;
    void sort;
    shown = PAGE;
  });

  const rows = $derived(holdings.data ? build_inventory(holdings.data.holdings, holdings.data.equipped) : []);
  const names = $derived(items.data ?? new Map());
  const found = $derived(find_rows(rows, names, { query, rarity, type, sort }));
  const rarity_options = $derived([{ value: "", label: "Any rarity" }, ...rarities(names).map((value) => ({ value, label: value }))]);
  const type_options = $derived([{ value: "", label: "Any type" }, ...types(names).map((value) => ({ value, label: type_label(value) }))]);
  const picked = $derived(found.find((row) => row.item_id === selected) ?? null);

  function holdings_problem(error: Gw2Error): Gw2Error {
    return error.kind === Gw2ErrorKind.MISSING_SCOPE
      ? new Gw2Error(error.kind, `${error.message} The inventory reads the bank, materials, shared slots and bags.`)
      : error;
  }
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    {@render picker()}
    <span class="flex-1"></span>
    <RefreshButton at={holdings.at} loading={holdings.loading} onrefresh={() => void holdings.load(true)} />
  </Toolbar>

  <div class="min-h-0 flex-1 overflow-auto">
    <Gate {account} scopes={[Scope.INVENTORIES]} onkey={() => onnavigate(Section.KEY)}>
      {#if holdings.error && !holdings.data}
        <Problem error={holdings_problem(holdings.error)} onretry={() => void holdings.load(true)} onkey={() => onnavigate(Section.KEY)} />
      {:else if !holdings.data}
        <div class="grid h-full place-items-center"><Spinner /></div>
      {:else}
        <div class="mx-auto flex max-w-5xl flex-col gap-3 p-4">
          {#if holdings.error}<StaleNotice error={holdings_problem(holdings.error)} />{/if}
          {#if !holdings.data.characters}
            <p class="text-2xs text-foreground/65">Characters aren't listed: the key lacks the characters permission.</p>
          {/if}

          <div class="flex flex-wrap items-center gap-2">
            <Input bind:value={query} type="search" placeholder="Search items by name or id" aria-label="Search items" class="min-w-48 flex-1">
              {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
            </Input>
            <Select aria-label="Type" options={type_options} bind:value={type} class="w-auto" />
            <Select aria-label="Rarity" options={rarity_options} bind:value={rarity} class="w-auto" />
            <Select aria-label="Sort" options={SORTS} bind:value={sort} class="w-auto" />
          </div>

          {#if items.error}
            <Problem error={items.error} onretry={() => void items.load(true)} onkey={() => onnavigate(Section.KEY)} />
          {:else if !items.data}
            <div class="flex justify-center p-6"><Spinner label="Loading item names" /></div>
          {:else if rows.length === 0}
            <EmptyState icon={BackpackIcon} title="Nothing stored" description="The bank, materials, shared slots and bags are all empty." />
          {:else}
            {#if picked}
              {@const item = names.get(picked.item_id)}
              <div class="sticky top-0 z-10 flex items-start gap-3 rounded-xl bg-background-light p-3 shadow-card ring-1 ring-hairline">
                {#if item}
                  <img
                    src={item.icon}
                    alt=""
                    class={cn("size-12 shrink-0 rounded-md", RARITY_COLORS[item.rarity] && "ring-2 ring-(--rarity)")}
                    style:--rarity={RARITY_COLORS[item.rarity]}
                    referrerpolicy="no-referrer"
                  />
                {/if}
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div class="flex items-baseline gap-2">
                    <p class="min-w-0 flex-1 truncate text-ui font-medium" title={item?.name}>{item?.name ?? `Item ${picked.item_id}`}</p>
                    <span class="font-mono text-ui tabular-nums">{picked.total.toLocaleString("en")}</span>
                  </div>
                  {#if item}
                    <p class="flex items-center gap-1.5 text-2xs text-foreground/65">
                      {#if RARITY_COLORS[item.rarity]}<span class="size-2 shrink-0 rounded-full bg-(--rarity)" style:--rarity={RARITY_COLORS[item.rarity]}></span>{/if}
                      {item.rarity} · {type_label(item.type)} · id {item.id}
                    </p>
                  {/if}
                  <ul class="flex flex-wrap gap-1.5" aria-label="Where">
                    {#each picked.places as place, index (index)}
                      <li
                        class={cn(
                          "rounded-md px-1.5 py-0.5 text-2xs ring-1 ring-hairline",
                          place.equipped ? "bg-secondary/12 text-secondary" : "bg-background text-foreground/80"
                        )}
                      >
                        {place.label}{place.equipped ? " · equipped" : ""}
                        <span class="font-mono tabular-nums">{place.count.toLocaleString("en")}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
                <IconButton label="Close details" size="sm" onclick={() => (selected = null)}><XIcon /></IconButton>
              </div>
            {/if}

            <p class="text-2xs text-foreground/65">
              {found.length.toLocaleString("en")} of {rows.length.toLocaleString("en")} items · pick one to see where it is
            </p>
            {#if found.length === 0}
              <p class="py-3 text-ui text-foreground/65">No item matches.</p>
            {:else}
              <ul class="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1.5 pointer-coarse:grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))]">
                {#each found.slice(0, shown) as row (row.item_id)}
                  {@const item = names.get(row.item_id)}
                  <li class="[content-visibility:auto] [contain-intrinsic-size:auto_3.25rem]">
                    <button
                      type="button"
                      class={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-md bg-background-light p-0.5 ring-1 ring-hairline ring-inset hover:brightness-110 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cottontail",
                        item && RARITY_COLORS[item.rarity] && "ring-2 ring-(--rarity)",
                        selected === row.item_id && "outline-2 outline-offset-2 outline-foreground"
                      )}
                      style:--rarity={item ? RARITY_COLORS[item.rarity] : undefined}
                      title={item?.name}
                      aria-label={`${item?.name ?? `Item ${row.item_id}`}, ${item?.rarity ?? ""}, ${row.total}`}
                      aria-pressed={selected === row.item_id}
                      onclick={() => (selected = selected === row.item_id ? null : row.item_id)}
                    >
                      {#if item}<img src={item.icon} alt="" class="size-full rounded-sm" loading="lazy" referrerpolicy="no-referrer" />{/if}
                      <span class="absolute right-0.5 bottom-0 font-mono text-2xs font-medium text-foreground tabular-nums [text-shadow:0_0_3px_var(--background-darkest),0_0_2px_var(--background-darkest)]">
                        {format_stack(row.total)}
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            {#if found.length > shown}
              <Button class="self-center" onclick={() => (shown += PAGE)}>Show {Math.min(PAGE, found.length - shown)} more</Button>
            {/if}
          {/if}
        </div>
      {/if}
    </Gate>
  </div>
</div>
