<script lang="ts">
  let { id, name }: { id: string; name: string } = $props();

  const SWATCHES = [0.32, 0.45, 0.58, 0.71, 0.84];
  const LISTENERS = 3;
  const HELPERS = ["fn", "{}", "[]", "<>", "?.", "=>"];
  const FRAMES = 7;
  const RESETS = [0.08, 0.3, 0.38, 0.66, 0.9];
  const shade = (l: number) => `oklch(from var(--primary) ${l} c h)`;
</script>

<span class="art grid h-full w-full place-items-center overflow-hidden" data-art={id} aria-hidden="true">
  {#if id === "brand"}
    <span class="page flex items-center gap-2.5 rounded-sm px-2.5 py-2">
      <span class="mark size-6 shrink-0 rounded-full"></span>
      <span class="flex flex-col gap-1.5">
        <span class="flex h-2.5 w-20 overflow-hidden rounded-full">
          {#each SWATCHES as l, i (l)}<span class="swatch flex-1" style:background={shade(l)} style:--i={i}></span>{/each}
        </span>
        <span class="line w-14"></span>
        <span class="line w-10"></span>
      </span>
    </span>
  {:else if id === "chrome-safe-inset"}
    <span class="flex items-center gap-2.5">
      <span class="phone relative flex h-14 w-8 flex-col rounded-md">
        <span class="notch absolute top-1 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full"></span>
        <span class="band h-2.5 shrink-0"></span>
        <span class="safe flex-1"></span>
        <span class="band h-2 shrink-0"></span>
      </span>
      <span class="flex flex-col gap-1 font-mono text-[0.625rem] leading-none text-foreground/70">
        <span><span class="text-primary">top</span> 47</span>
        <span><span class="text-primary">bottom</span> 34</span>
      </span>
    </span>
  {:else if id === "Logo Proof"}
    <span class="flex items-end gap-2.5">
      {#each [0.75, 1.25, 2] as size, i (size)}
        <span class="proof grid place-items-center rounded-sm" style:--i={i} style:padding="{size * 0.2}rem">
          <span class="logo grid place-items-center font-bold" style:width="{size}rem" style:height="{size}rem" style:font-size="{size * 0.55}rem">L</span>
        </span>
      {/each}
    </span>
  {:else if id === "Time Since"}
    <span class="flex w-[75%] flex-col items-center gap-2">
      <span class="font-mono text-ui leading-none text-foreground tabular-nums">12d 04:3<span class="tick inline-block">7</span></span>
      <span class="resets relative h-2 w-full">
        {#each RESETS as at (at)}<span class="reset absolute top-0 h-2 w-px" style:left="{at * 100}%"></span>{/each}
      </span>
    </span>
  {:else if id === "game-clip"}
    <span class="film relative flex gap-0.5 rounded-sm px-1 py-1.5">
      {#each { length: FRAMES } as _, i (i)}<span class="frame h-6 w-4 rounded-[2px]" class:kept={i >= FRAMES - 3}></span>{/each}
      <span class="clip absolute -top-1 -bottom-1 rounded-sm"></span>
      <span class="gif absolute -top-2 right-0 rounded-sm px-1 font-mono text-[0.5625rem] leading-3 font-semibold">GIF</span>
    </span>
  {:else if id === "optional"}
    <span class="flex items-end gap-4 font-mono text-[0.625rem] leading-none">
      <span class="flex flex-col items-center gap-1.5">
        <span class="slot grid size-8 place-items-center rounded-md"><span class="value grid size-5 place-items-center rounded-sm font-semibold">T</span></span>
        <span class="text-foreground/70">value</span>
      </span>
      <span class="flex flex-col items-center gap-1.5">
        <span class="slot empty grid size-8 place-items-center rounded-md"></span>
        <span class="text-primary">null</span>
      </span>
    </span>
  {:else if id === "event-emitter"}
    <span class="flex items-center gap-1">
      <span class="emitter size-4 shrink-0 rounded-full"></span>
      <span class="flex flex-col gap-2">
        {#each { length: LISTENERS } as _, i (i)}
          <span class="flex items-center" style:--i={i}>
            <span class="wire h-px w-8"></span>
            <span class="listener size-2 rounded-full"></span>
          </span>
        {/each}
      </span>
    </span>
  {:else if id === "utils"}
    <span class="grid grid-cols-3 gap-1 font-mono text-[0.625rem] leading-none">
      {#each HELPERS as helper, i (helper)}
        <span class="helper grid h-5 w-7 place-items-center rounded-sm" class:picked={i === 4} style:--i={i}>{helper}</span>
      {/each}
    </span>
  {:else}
    <span class="font-mono text-lg font-semibold text-primary">{name.charAt(0).toUpperCase()}</span>
  {/if}
</span>

<style>
  .page {
    background: var(--portfolio-card);
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .mark {
    background: var(--primary);
  }

  .line {
    height: 0.25rem;
    border-radius: 999px;
    background: color-mix(in oklch, var(--foreground) 18%, transparent);
  }

  .swatch {
    transition: flex-grow 260ms var(--ease-out) calc(var(--i) * 40ms);
  }

  .phone {
    overflow: hidden;
    box-shadow: 0 0 0 1.5px color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  .notch {
    background: color-mix(in oklch, var(--foreground) 45%, transparent);
  }

  .band {
    background: color-mix(in oklch, var(--foreground) 14%, transparent);
  }

  .safe {
    margin: 1px;
    border: 1px dashed color-mix(in oklch, var(--primary) 75%, transparent);
    border-radius: 2px;
    transition: background-color 260ms var(--ease-out);
  }

  .proof {
    background: var(--portfolio-card);
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent);
    transition: translate 220ms var(--ease-out) calc(var(--i) * 50ms);
  }

  .logo {
    border-radius: 22%;
    background: var(--primary);
    color: var(--background);
    line-height: 1;
  }

  .resets {
    border-bottom: 1px solid color-mix(in oklch, var(--foreground) 22%, transparent);
  }

  .reset {
    background: var(--primary);
  }

  .film {
    background: color-mix(in oklch, var(--foreground) 10%, transparent);
  }

  .frame {
    background: color-mix(in oklch, var(--foreground) 16%, transparent);
  }

  .frame.kept {
    background: color-mix(in oklch, var(--primary) 45%, transparent);
  }

  .clip {
    right: 0.125rem;
    width: calc(3 * 1rem + 2 * 0.125rem + 0.25rem);
    box-shadow: 0 0 0 1.5px var(--primary);
    transition: translate 320ms var(--ease-out);
  }

  .gif {
    background: var(--primary);
    color: var(--background);
  }

  .slot {
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 22%, transparent);
  }

  .slot.empty {
    box-shadow: none;
    border: 1px dashed color-mix(in oklch, var(--primary) 75%, transparent);
  }

  .value {
    background: var(--primary);
    color: var(--background);
    transition: scale 220ms var(--ease-out);
  }

  .emitter {
    background: var(--primary);
  }

  .wire {
    background: color-mix(in oklch, var(--foreground) 22%, transparent);
    transition: background-color 200ms var(--ease-out) calc(var(--i) * 70ms);
  }

  .listener {
    box-shadow: 0 0 0 1.5px color-mix(in oklch, var(--foreground) 45%, transparent);
    transition:
      background-color 200ms var(--ease-out) calc(var(--i) * 70ms + 120ms),
      box-shadow 200ms var(--ease-out) calc(var(--i) * 70ms + 120ms);
  }

  .helper {
    background: var(--portfolio-card);
    color: color-mix(in oklch, var(--foreground) 65%, transparent);
    box-shadow: 0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent);
    transition: translate 220ms var(--ease-out) calc(var(--i) * 40ms);
  }

  .helper.picked {
    background: var(--primary);
    color: var(--background);
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    :global(.tile:is(:hover, :focus-within)) .art .value {
      scale: 1.15;
    }

    :global(.tile:is(:hover, :focus-within)) .art .wire {
      background: var(--primary);
    }

    :global(.tile:is(:hover, :focus-within)) .art .listener {
      background: var(--primary);
      box-shadow: 0 0 0 1.5px var(--primary);
    }

    :global(.tile:is(:hover, :focus-within)) .art .helper {
      translate: 0 -0.125rem;
    }

    :global(.tile:is(:hover, :focus-within)) .art .swatch:nth-child(3) {
      flex-grow: 2.4;
    }

    :global(.tile:is(:hover, :focus-within)) .art .safe {
      background: color-mix(in oklch, var(--primary) 14%, transparent);
    }

    :global(.tile:is(:hover, :focus-within)) .art .proof {
      translate: 0 -0.1875rem;
    }

    :global(.tile:is(:hover, :focus-within)) .art .tick {
      animation: tick 1s steps(1) infinite;
    }

    :global(.tile:is(:hover, :focus-within)) .art .clip {
      translate: -0.75rem 0;
    }
  }

  @keyframes tick {
    50% {
      opacity: 0.25;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .swatch,
    .safe,
    .proof,
    .clip,
    .value,
    .wire,
    .listener,
    .helper {
      transition: none;
    }
  }
</style>
