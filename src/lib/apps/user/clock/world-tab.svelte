<script lang="ts">
  import { Button, EmptyState, IconButton, Input } from "$lib/core/components/ui";
  import { cn, format_date, pad2 } from "$lib/core/utils";
  import { GlobeHemisphereWest, MagnifyingGlass, Moon, Sun, X } from "phosphor-svelte";
  import { tick } from "svelte";
  import type { ClockFile } from "./ringer.svelte";
  import {
    all_zones,
    day_label,
    day_shift,
    format_offset,
    format_utc_offset,
    format_wall,
    is_daytime,
    is_zone,
    local_zone,
    search_zones,
    wall_time,
    zone_city,
    zone_offset,
    zone_region,
  } from "./zones";

  let { file, now, adding = $bindable(false) }: { file: ClockFile; now: number; adding?: boolean } = $props();

  const home = local_zone();
  const date = $derived(new Date(now));
  const weekday = $derived(date.toLocaleDateString("en-US", { weekday: "long" }));
  const home_offset = $derived(zone_offset(now, home));

  const zones = $derived(file.value.zones.filter(is_zone));
  const rows = $derived(
    zones.map((zone) => {
      const wall = wall_time(now, zone);
      const offset = zone_offset(now, zone);
      return { zone, wall, shift: day_shift(now, zone, home), relative: offset - home_offset, offset };
    })
  );

  let query = $state("");
  let search_input = $state<HTMLInputElement | null>(null);
  const everything = all_zones();
  const results = $derived(adding ? search_zones(everything, query, 60) : []);

  $effect(() => {
    if (!adding) return;
    query = "";
    void tick().then(() => search_input?.focus());
  });

  function add(zone: string) {
    if (!file.value.zones.includes(zone)) file.value.zones.push(zone);
    adding = false;
  }

  function remove(zone: string) {
    file.value.zones = file.value.zones.filter((entry) => entry !== zone);
  }
</script>

{#if adding}
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-2 border-b border-foreground/8 p-2">
      <Input
        bind:element={search_input}
        bind:value={query}
        size="sm"
        class="min-w-0 flex-1"
        placeholder="Search a city or time zone"
        aria-label="Search time zones"
        onkeydown={(event) => {
          if (event.key === "Escape") adding = false;
          if (event.key === "Enter" && results[0]) add(results[0]);
        }}
      >
        {#snippet leading()}<MagnifyingGlass />{/snippet}
      </Input>
      <Button variant="quiet" size="sm" onclick={() => (adding = false)}>Cancel</Button>
    </div>
    <ul class="min-h-0 flex-1 overflow-auto p-1.5">
      {#each results as zone (zone)}
        {@const wall = wall_time(now, zone)}
        {@const added = file.value.zones.includes(zone)}
        <li>
          <button
            type="button"
            class="flex min-h-10 w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left hover:bg-foreground/6 focus-visible:bg-primary/12 focus-visible:outline-none disabled:opacity-38"
            disabled={added}
            onclick={() => add(zone)}
          >
            <span class="grid min-w-0 flex-1">
              <span class="truncate text-ui font-medium">{zone_city(zone)}</span>
              <span class="truncate text-2xs text-foreground/55">{zone_region(zone) || "Coordinated Universal Time"}{added ? " · added" : ""}</span>
            </span>
            <span class="shrink-0 text-right font-mono text-2xs text-foreground/65 tabular-nums">
              <span class="text-ui text-foreground">{format_wall(wall)}</span>
              <span class="block">{format_utc_offset(zone_offset(now, zone))}</span>
            </span>
          </button>
        </li>
      {:else}
        <li class="px-2.5 py-3 text-ui text-foreground/65">Nothing here is called “{query.trim()}”.</li>
      {/each}
    </ul>
  </div>
{:else}
  <div class="h-full overflow-auto">
    <div class="mx-auto grid max-w-2xl gap-4 p-4 @md:p-6">
      <section class="grid justify-items-center gap-1 py-4 text-center" aria-label="Local time">
        <p class="font-mono text-6xl leading-none font-bold tabular-nums @md:text-7xl">
          {pad2(date.getHours())}:{pad2(date.getMinutes())}<span class="text-2xl font-normal text-foreground/50 @md:text-3xl">:{pad2(date.getSeconds())}</span>
        </p>
        <p class="mt-2 text-sm">{weekday}, {format_date(date)}</p>
        <p class="font-mono text-2xs text-foreground/55">{home.replaceAll("_", " ")} · {format_utc_offset(home_offset)}</p>
      </section>

      {#if rows.length === 0}
        <EmptyState icon={GlobeHemisphereWest} title="No other cities" description="Add a city to see its time next to yours." class="h-auto p-4">
          {#snippet actions()}<Button size="sm" onclick={() => (adding = true)}>Add city</Button>{/snippet}
        </EmptyState>
      {:else}
        <ul class="grid gap-1" aria-label="Cities">
          {#each rows as row (row.zone)}
            {@const day = is_daytime(row.wall.hour)}
            <li class="group flex min-h-14 items-center gap-3 rounded-lg bg-background-light px-3 py-2">
              <span class="grid size-8 shrink-0 place-items-center rounded-md bg-foreground/6 text-foreground/65" title={day ? "Daytime" : "Night"}>
                {#if day}<Sun weight="duotone" class="size-4.5" />{:else}<Moon weight="duotone" class="size-4.5" />{/if}
              </span>
              <span class="grid min-w-0 flex-1">
                <span class="truncate text-ui font-medium">{zone_city(row.zone)}</span>
                <span class="truncate text-2xs text-foreground/55">{day_label(row.shift)}, {format_offset(row.relative)}</span>
              </span>
              <span class={cn("font-mono text-2xl font-medium tabular-nums", !day && "text-foreground/75")}>{format_wall(row.wall)}</span>
              <IconButton label="Remove {zone_city(row.zone)}" size="sm" class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" onclick={() => remove(row.zone)}>
                <X />
              </IconButton>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
