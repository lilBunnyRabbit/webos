<script lang="ts">
  import { Button, EmptyState, IconButton, Input, Spinner, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { MagnifyingGlass as MagnifyingGlassIcon, Plus as PlusIcon, Target as TargetIcon, Trash as TrashIcon, X as XIcon } from "phosphor-svelte";
  import { get_items, Gw2Error, Gw2ErrorKind, Scope, type Item } from "./api";
  import type { SectionProps } from "./account.svelte";
  import Gate from "./gate.svelte";
  import { clamp_target, goal_progress, GoalsSchema, order_goals, owned_ids, type Goal } from "./goals";
  import { load_holdings } from "./holdings";
  import Problem from "./problem.svelte";
  import StaleNotice from "./stale-notice.svelte";
  import ProgressBar from "./progress-bar.svelte";
  import RefreshButton from "./refresh-button.svelte";
  import { Resource } from "./resource.svelte";
  import { Section } from "./sections";

  let { account, picker, active, onnavigate }: SectionProps = $props();
  const { storage } = get_app_context();

  const PICKER_LIMIT = 40;

  const goals = storage.persisted<Goal[]>("goals", [], GoalsSchema);

  const holdings = new Resource(async (max_age) => {
    const result = await load_holdings(account.key.value, account.permissions, max_age);
    return { data: result, at: result.at };
  });
  const owned_items = new Resource(async () => ({
    data: await get_items(owned_ids(holdings.data?.holdings ?? [])),
    at: Date.now(),
  }));

  let adding = $state(false);
  let query = $state("");
  let new_target = $state(250);
  let lookup = $state.raw<Item | null>(null);
  let lookup_error = $state<string | null>(null);

  const ready = $derived(account.token.data !== null && account.permissions.includes(Scope.INVENTORIES));

  $effect(() => {
    if (active && ready && account.key.value) void holdings.load();
  });

  $effect(() => {
    if (adding && holdings.data) void owned_items.load();
  });

  const board = $derived(
    order_goals(goals.value.map((goal) => ({ goal, progress: goal_progress(holdings.data?.holdings ?? [], goal) })))
  );

  const matches = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const taken = new Set(goals.value.map((goal) => goal.item_id));
    const items = [...(owned_items.data?.values() ?? [])].filter((item) => !taken.has(item.id));
    const found = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
    return found.sort((a, b) => a.name.localeCompare(b.name)).slice(0, PICKER_LIMIT);
  });
  const typed_id = $derived(/^\d+$/.test(query.trim()) ? Number(query.trim()) : null);

  $effect(() => {
    const id = typed_id;
    lookup = null;
    lookup_error = null;
    if (id === null) return;
    let cancelled = false;
    get_items([id])
      .then((items) => {
        if (cancelled) return;
        lookup = items.get(id) ?? null;
        if (!lookup) lookup_error = `No item has the id ${id}.`;
      })
      .catch((error: unknown) => {
        if (!cancelled) lookup_error = error instanceof Gw2Error ? error.message : "Couldn't look the item up.";
      });
    return () => {
      cancelled = true;
    };
  });

  function add(item: Item) {
    goals.value = [
      ...goals.value,
      { id: crypto.randomUUID(), item_id: item.id, name: item.name, icon: item.icon, target: clamp_target(new_target) },
    ];
    adding = false;
    query = "";
  }

  function set_target(id: string, value: number) {
    goals.value = goals.value.map((goal) => (goal.id === id ? { ...goal, target: clamp_target(value) } : goal));
  }

  function remove(id: string) {
    goals.value = goals.value.filter((goal) => goal.id !== id);
  }

  function holdings_problem(error: Gw2Error): Gw2Error {
    return error.kind === Gw2ErrorKind.MISSING_SCOPE
      ? new Gw2Error(error.kind, `${error.message} Goals count the bank, materials and bags.`)
      : error;
  }
</script>

{#snippet item_row(item: Item)}
  <li>
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-foreground/8 active:bg-foreground/12 focus-visible:outline-2 focus-visible:outline-cottontail pointer-coarse:py-3"
      onclick={() => add(item)}
    >
      <img src={item.icon} alt="" class="size-7 shrink-0 rounded-sm" loading="lazy" referrerpolicy="no-referrer" />
      <span class="min-w-0 flex-1 truncate text-ui">{item.name}</span>
      <span class="font-mono text-2xs text-foreground/65">{item.id}</span>
    </button>
  </li>
{/snippet}

<div class="flex h-full flex-col">
  <Toolbar>
    {@render picker()}
    <Button size="sm" variant={adding ? "secondary" : "primary"} onclick={() => (adding = !adding)} disabled={!holdings.data}>
      {#if adding}<XIcon weight="bold" />Cancel{:else}<PlusIcon weight="bold" />Add goal{/if}
    </Button>
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
        <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4">
          {#if holdings.error}<StaleNotice error={holdings_problem(holdings.error)} />{/if}
          {#if !holdings.data.characters}
            <p class="text-2xs text-foreground/65">Character bags aren't counted: the key lacks the characters permission.</p>
          {/if}

          {#if adding}
            <div class="flex flex-col gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
              <div class="flex flex-wrap items-center gap-2">
                <Input bind:value={query} type="search" placeholder="Search your items, or type an item id" aria-label="Item" class="min-w-48 flex-1">
                  {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
                </Input>
                <label class="flex items-center gap-1.5 text-ui text-foreground/80">
                  Target
                  <Input type="number" min={1} max={1_000_000} bind:value={new_target} class="w-24 font-mono tabular-nums" />
                </label>
              </div>
              <ul class="max-h-72 overflow-auto rounded-lg bg-background ring-1 ring-foreground/8">
                {#if lookup}
                  {@render item_row(lookup)}
                {:else if lookup_error}
                  <li class="px-4 py-2 text-ui text-foreground/65">{lookup_error}</li>
                {/if}
                {#if owned_items.loading && !owned_items.data}
                  <li class="flex justify-center p-4"><Spinner label="Loading your items" /></li>
                {:else if owned_items.error}
                  <li class="px-4 py-2 text-ui text-error">{owned_items.error.message}</li>
                {:else}
                  {#each matches as item (item.id)}
                    {@render item_row(item)}
                  {:else}
                    {#if !lookup}<li class="px-4 py-2 text-ui text-foreground/65">Nothing you own matches. Type an item id to track something else.</li>{/if}
                  {/each}
                {/if}
              </ul>
            </div>
          {/if}

          {#if board.length === 0 && !adding}
            <EmptyState icon={TargetIcon} title="No goals yet" description="Pick an item and how many you need; progress counts your bank, materials and bags.">
              {#snippet actions()}
                <Button variant="primary" onclick={() => (adding = true)}><PlusIcon weight="bold" />Add goal</Button>
              {/snippet}
            </EmptyState>
          {:else}
            <ul class="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-3">
              {#each board as { goal, progress } (goal.id)}
                <li class={cn("flex flex-col gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8", progress.done && "ring-success/40")}>
                  <div class="flex items-start gap-3">
                    <img src={goal.icon} alt="" class="size-10 shrink-0 rounded-md" loading="lazy" referrerpolicy="no-referrer" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-ui font-medium" title={goal.name}>{goal.name}</p>
                      <p class={cn("font-mono text-2xs tabular-nums", progress.done ? "text-success" : "text-foreground/80")}>
                        {progress.owned.toLocaleString("en")} / {goal.target.toLocaleString("en")}{progress.done ? " · done" : ` · ${(goal.target - progress.owned).toLocaleString("en")} to go`}
                      </p>
                    </div>
                    <IconButton label="Remove goal" size="sm" onclick={() => remove(goal.id)}><TrashIcon /></IconButton>
                  </div>
                  <ProgressBar value={progress.fraction} done={progress.done} label={goal.name} />
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="min-w-0 flex-1 text-2xs text-foreground/65">
                      {progress.sources.length === 0 ? "None owned yet" : progress.sources.map((source) => `${source.label} ${source.count.toLocaleString("en")}`).join(" · ")}
                    </p>
                    <label class="flex items-center gap-1.5 text-2xs text-foreground/80">
                      Target
                      <Input
                        size="sm"
                        type="number"
                        min={1}
                        max={1_000_000}
                        value={goal.target}
                        onchange={(event) => set_target(goal.id, event.currentTarget.valueAsNumber)}
                        class="w-20 font-mono tabular-nums"
                      />
                    </label>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </Gate>
  </div>
</div>
