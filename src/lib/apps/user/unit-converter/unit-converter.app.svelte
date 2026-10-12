<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Badge, Button, EmptyState, IconButton, Input, Select, SideNav } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Angle as AngleIcon,
    ArrowsDownUp as ArrowsDownUpIcon,
    ArrowsLeftRight as ArrowsLeftRightIcon,
    Clock as ClockIcon,
    Drop as DropIcon,
    Gauge as GaugeIcon,
    HardDrives as HardDrivesIcon,
    Lightning as LightningIcon,
    MagnifyingGlass as MagnifyingGlassIcon,
    Ruler as RulerIcon,
    Scales as ScalesIcon,
    Speedometer as SpeedometerIcon,
    SquaresFour as SquaresFourIcon,
    Thermometer as ThermometerIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import {
    convert,
    format_number,
    group_units,
    parse_number,
    resolve_pair,
    saved_state_schema,
    search_other_quantities,
    unit_label,
    unit_matches,
    type SavedState,
  } from "./convert";
  import { QUANTITIES, Quantity, TABLES, type Unit } from "./units";

  const ICONS: Record<Quantity, IconComponent> = {
    length: RulerIcon,
    mass: ScalesIcon,
    temperature: ThermometerIcon,
    volume: DropIcon,
    area: SquaresFourIcon,
    speed: SpeedometerIcon,
    time: ClockIcon,
    data: HardDrivesIcon,
    pressure: GaugeIcon,
    energy: LightningIcon,
    angle: AngleIcon,
  };
  const NAV_ITEMS = QUANTITIES.map((value) => ({ value, label: TABLES[value].label, icon: ICONS[value] }));
  const DEFAULT_STATE: SavedState = { quantity: Quantity.LENGTH, units: {} };

  type Side = "from" | "to";

  const { storage } = get_app_context();
  // Per window so two converters don't fight; "last" only seeds the next new window.
  const view = storage.window(
    "view",
    storage.get("last", saved_state_schema) ?? DEFAULT_STATE,
    saved_state_schema
  );

  const uid = $props.id();

  let source = $state<{ side: Side; text: string }>({ side: "from", text: "1" });
  let query = $state("");

  const quantity = $derived(view.value.quantity);
  const table = $derived(TABLES[quantity]);
  const pair = $derived(resolve_pair(quantity, view.value.units[quantity]));
  const unit_options = $derived(table.units.map((unit) => ({ value: unit.id, label: unit_label(unit) })));

  const amount = $derived(parse_number(source.text));
  const invalid = $derived(amount === null && source.text.trim() !== "");
  const source_unit = $derived(source.side === "from" ? pair.from : pair.to);
  const from_amount = $derived(amount === null ? null : convert(amount, source_unit, pair.from));

  const visible_units = $derived(table.units.filter((unit) => unit_matches(unit, query)));
  const groups = $derived(group_units(visible_units));
  const elsewhere = $derived(visible_units.length === 0 ? search_other_quantities(quantity, query) : []);

  function text_for(side: Side): string {
    if (source.side === side) return source.text;
    if (amount === null) return "";
    return format_number(convert(amount, source_unit, side === "from" ? pair.from : pair.to));
  }

  function value_in(unit: Unit): string {
    return from_amount === null ? "–" : format_number(convert(from_amount, pair.from, unit));
  }

  function save(next: SavedState) {
    view.value = next;
    storage.set("last", next);
  }

  function set_units(next_quantity: Quantity, from: string, to: string) {
    save({ quantity: next_quantity, units: { ...view.value.units, [next_quantity]: { from, to } } });
  }

  function set_quantity(next: Quantity) {
    if (next === quantity) return;
    save({ ...view.value, quantity: next });
    query = "";
  }

  function set_unit(side: Side, id: string) {
    if (side === "from") set_units(quantity, id, pair.to.id);
    else set_units(quantity, pair.from.id, id);
  }

  function swap() {
    set_units(quantity, pair.to.id, pair.from.id);
    source.side = source.side === "from" ? "to" : "from";
  }

  function pick_target(unit: Unit) {
    if (unit === pair.from) swap();
    else set_unit("to", unit.id);
  }

  function jump_to(next_quantity: Quantity, unit: Unit) {
    const current = resolve_pair(next_quantity, view.value.units[next_quantity]);
    const from = current.from === unit ? current.to : current.from;
    set_units(next_quantity, from.id, unit.id);
    query = "";
  }
</script>

{#snippet field(side: Side, label: string)}
  {@const unit = side === "from" ? pair.from : pair.to}
  {@const errored = invalid && source.side === side}
  <div class="flex min-w-0 flex-col gap-2">
    <label for="{uid}-{side}" class="sr-only">
      {label}
    </label>
    <Input
      id="{uid}-{side}"
      size="lg"
      class={cn("font-mono tabular-nums", errored && "ring-2 ring-error/70 hover:ring-error/70")}
      inputmode={quantity === Quantity.TEMPERATURE ? "text" : "decimal"}
      autocomplete="off"
      spellcheck={false}
      aria-invalid={errored}
      aria-describedby={errored ? `${uid}-error` : undefined}
      value={text_for(side)}
      oninput={(event) => (source = { side, text: event.currentTarget.value })}
    />
    <Select
      aria-label="{label} unit"
      options={unit_options}
      bind:value={() => unit.id, (id) => set_unit(side, id)}
    />
  </div>
{/snippet}

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Quantities" items={NAV_ITEMS} bind:value={() => quantity, set_quantity} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 @md:px-6">
      <h1 class="text-lg font-semibold">{table.label}</h1>

      <section class="flex flex-col gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
        <div class="grid gap-3 @lg:grid-cols-[1fr_auto_1fr]">
          {@render field("from", "From")}
          <div class="flex justify-center @lg:self-start">
            <IconButton size="lg" label="Swap units" onclick={swap}>
              <ArrowsDownUpIcon weight="bold" class="@lg:hidden" />
              <ArrowsLeftRightIcon weight="bold" class="hidden @lg:block" />
            </IconButton>
          </div>
          {@render field("to", "To")}
        </div>

        {#if invalid}
          <p id="{uid}-error" class="text-ui text-error" aria-live="polite">Type a number, such as 12.5 or 3e8.</p>
        {:else}
          <p class="font-mono text-2xs text-foreground/65 tabular-nums">
            1 {pair.from.symbol} = {format_number(convert(1, pair.from, pair.to))}
            {pair.to.symbol}
          </p>
        {/if}
      </section>

      <section class="flex flex-col gap-2.5">
        <header class="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <h2 class="text-sm font-semibold">All units</h2>
          <Input
            size="sm"
            class="w-40 @md:w-56"
            placeholder="Filter units"
            aria-label="Filter units"
            bind:value={query}
          >
            {#snippet leading()}<MagnifyingGlassIcon />{/snippet}
            {#snippet trailing()}
              {#if query}
                <IconButton size="sm" label="Clear filter" class="size-5 pointer-coarse:size-7" onclick={() => (query = "")}>
                  <XIcon weight="bold" />
                </IconButton>
              {/if}
            {/snippet}
          </Input>
        </header>

        {#if visible_units.length === 0}
          <EmptyState
            class="h-auto rounded-xl bg-background-light p-6"
            icon={MagnifyingGlassIcon}
            title="Nothing in {table.label.toLowerCase()} is called “{query.trim()}”"
            description={elsewhere.length ? "Found in another quantity:" : "Try a unit name or symbol, such as km or GiB."}
          >
            {#snippet actions()}
              {#if elsewhere.length}
                <div class="flex flex-wrap justify-center gap-1.5">
                  {#each elsewhere as match (match.quantity)}
                    {#each match.units as unit (unit.id)}
                      <Button size="sm" onclick={() => jump_to(match.quantity, unit)}>
                        {TABLES[match.quantity].label}: {unit_label(unit)}
                      </Button>
                    {/each}
                  {/each}
                </div>
              {/if}
            {/snippet}
          </EmptyState>
        {:else}
          <div class="flex flex-col gap-3 rounded-xl bg-background-light p-1.5 ring-1 ring-foreground/8">
            {#each groups as group (group.label)}
              <div class="flex flex-col">
                {#if group.label}
                  <h3 class="px-2.5 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">
                    {group.label}
                  </h3>
                {/if}
                {#each group.units as unit (unit.id)}
                  {@const is_from = unit === pair.from}
                  {@const is_to = unit === pair.to}
                  <button
                    type="button"
                    title={unit.note}
                    aria-label="{unit.name}: {value_in(unit)} {unit.symbol}. Convert to {unit.name}"
                    onclick={() => pick_target(unit)}
                    class={cn(
                      "flex min-h-8 items-center gap-3 rounded-md px-2.5 py-1 text-left transition-colors duration-150 pointer-coarse:min-h-10",
                      "hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:ring-inset",
                      is_to && "bg-primary/14 hover:bg-primary/14"
                    )}
                  >
                    <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                      <span class="truncate text-ui">{unit.name}</span>
                      {#if unit.note}
                        <span class="hidden truncate text-2xs text-foreground/65 @md:inline">{unit.note}</span>
                      {/if}
                    </span>
                    {#if is_from}<Badge>From</Badge>{:else if is_to}<Badge tone="primary">To</Badge>{/if}
                    <span class="shrink-0 text-right font-mono text-2xs tabular-nums">
                      {value_in(unit)}
                      <span class="text-foreground/65">{unit.symbol}</span>
                    </span>
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  </main>
</div>
