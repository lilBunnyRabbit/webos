<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import type { IconComponent } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    Acorn,
    ArrowCounterClockwise as UndoIcon,
    Bird,
    Bug,
    Butterfly,
    Cactus,
    Carrot,
    Cloud,
    Clover,
    Drop,
    Egg,
    Feather,
    Flower,
    FlowerLotus,
    FlowerTulip,
    Leaf,
    Moon,
    Plant,
    Rabbit,
    Sun,
    Tree,
    TreeEvergreen,
  } from "phosphor-svelte";
  import { HOPS, MEADOW_COLUMNS, type Plot } from "./quick";

  interface Props {
    plots: readonly Plot[];
    label: string;
    busy?: boolean;
    onsubmit: (hops: Plot[]) => void;
  }

  let { plots, label, busy = false, onsubmit }: Props = $props();

  const ICONS: Record<Plot, { icon: IconComponent; name: string }> = {
    carrot: { icon: Carrot, name: "Carrot" },
    clover: { icon: Clover, name: "Clover" },
    flower: { icon: Flower, name: "Flower" },
    tulip: { icon: FlowerTulip, name: "Tulip" },
    lotus: { icon: FlowerLotus, name: "Lotus" },
    leaf: { icon: Leaf, name: "Leaf" },
    plant: { icon: Plant, name: "Sprout" },
    tree: { icon: Tree, name: "Tree" },
    pine: { icon: TreeEvergreen, name: "Pine" },
    cactus: { icon: Cactus, name: "Cactus" },
    acorn: { icon: Acorn, name: "Acorn" },
    butterfly: { icon: Butterfly, name: "Butterfly" },
    bug: { icon: Bug, name: "Beetle" },
    bird: { icon: Bird, name: "Bird" },
    sun: { icon: Sun, name: "Sun" },
    moon: { icon: Moon, name: "Moon" },
    cloud: { icon: Cloud, name: "Cloud" },
    drop: { icon: Drop, name: "Raindrop" },
    egg: { icon: Egg, name: "Egg" },
    feather: { icon: Feather, name: "Feather" },
  };

  let hops = $state<number[]>([]);
  let focus = $state(0);
  const cells: HTMLButtonElement[] = [];

  export function clear() {
    hops = [];
  }

  function hop(index: number) {
    if (busy || hops.length >= HOPS) return;
    hops = [...hops, index];
    if (hops.length === HOPS) {
      const path = hops.map((at) => plots[at]);
      setTimeout(() => {
        hops = [];
        onsubmit(path);
      }, 120);
    }
  }

  function move(index: number) {
    focus = (index + plots.length) % plots.length;
    cells[focus]?.focus();
  }

  function on_key(event: KeyboardEvent, index: number) {
    const rows = Math.ceil(plots.length / MEADOW_COLUMNS);
    const row = Math.floor(index / MEADOW_COLUMNS);
    const col = index % MEADOW_COLUMNS;
    const moves: Record<string, number> = {
      ArrowLeft: row * MEADOW_COLUMNS + ((col + MEADOW_COLUMNS - 1) % MEADOW_COLUMNS),
      ArrowRight: row * MEADOW_COLUMNS + ((col + 1) % MEADOW_COLUMNS),
      ArrowUp: ((row + rows - 1) % rows) * MEADOW_COLUMNS + col,
      ArrowDown: ((row + 1) % rows) * MEADOW_COLUMNS + col,
      Home: row * MEADOW_COLUMNS,
      End: row * MEADOW_COLUMNS + MEADOW_COLUMNS - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      move(moves[event.key]);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      hops = hops.slice(0, -1);
    }
  }

  const current = $derived(hops.at(-1));
</script>

<div class="grid w-full max-w-72 justify-items-center gap-3">
  <div class="flex items-center gap-3">
    <div class="flex gap-1.5" role="status" aria-label={`${hops.length} of ${HOPS} hops`}>
      {#each Array.from({ length: HOPS }, (_, i) => i) as i (i)}
        <span class={cn("size-2.5 rounded-full transition-colors", i < hops.length ? "bg-primary" : "bg-foreground/15")}></span>
      {/each}
    </div>
    <IconButton label="Undo hop" size="sm" disabled={hops.length === 0 || busy} onclick={() => (hops = hops.slice(0, -1))}><UndoIcon weight="bold" /></IconButton>
  </div>
  <div role="group" aria-label={label} class="grid w-full grid-cols-4 gap-2" aria-busy={busy}>
    {#each plots as plot, index (plot)}
      {@const Icon = ICONS[plot].icon}
      <button
        bind:this={cells[index]}
        type="button"
        tabindex={index === focus ? 0 : -1}
        aria-label={ICONS[plot].name}
        class={cn(
          "relative grid aspect-square min-h-11 place-items-center rounded-xl bg-background-light text-foreground/80 ring-1 ring-foreground/8 transition-[background-color,transform] select-none hover:bg-foreground/8 active:scale-95 disabled:opacity-38 [&_svg]:size-6 @sm:[&_svg]:size-7",
          index === current && "bg-primary/15 text-primary ring-primary/40 hover:bg-primary/15"
        )}
        disabled={busy}
        onfocus={() => (focus = index)}
        onclick={() => hop(index)}
        onkeydown={(event) => on_key(event, index)}
      >
        {#if index === current}
          <Rabbit weight="fill" />
        {:else}
          <Icon weight="duotone" />
        {/if}
      </button>
    {/each}
  </div>
</div>
