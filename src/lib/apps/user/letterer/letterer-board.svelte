<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Mark, type Row } from "./feedback";
  import { display } from "./tiles";

  interface Props {
    rows: readonly Row[];
    current: string | null;
    length: number;
    total: number;
    reveal: number;
    shake: boolean;
    solved: boolean;
    label: string;
  }

  const { rows, current, length, total, reveal, shake, solved, label }: Props = $props();

  const FILL: Record<Mark, string> = {
    correct: "bg-success text-background",
    present: "bg-warning text-background",
    absent: "bg-foreground/22 text-foreground/80",
  };
  const SAY: Record<Mark, string> = { correct: "correct", present: "in the word", absent: "not in the word" };

  const blanks = $derived(Math.max(0, total - rows.length - (current === null ? 0 : 1)));

  function row_label(row: Row): string {
    return [...row.guess].map((char, i) => `${display(char)} ${SAY[row.marks[i]]}`).join(", ");
  }
</script>

<div
  class={cn("grid content-start gap-[var(--gap)] rounded-lg transition-opacity", solved && rows.length > 0 && "opacity-60")}
  style:grid-template-columns="repeat({length}, var(--tile))"
  role="list"
  aria-label={label}
>
  {#each rows as row, index (index)}
    <div role="listitem" class="contents" aria-label={row_label(row)}>
      {#each row.marks as mark, i (i)}
        <span
          class={cn("tile shadow-raised", FILL[mark], index === reveal && "reveal")}
          style:--delay="{i * 110}ms"
          aria-hidden="true">{display(row.guess[i])}</span
        >
      {/each}
    </div>
  {/each}
  {#if current !== null}
    <div role="listitem" class="contents" aria-label="Typing {current ? [...current].map(display).join(' ') : 'nothing yet'}">
      {#each { length }, i (i)}
        <span
          class={cn("tile ring-1 ring-inset", current[i] ? "bg-raised shadow-raised ring-foreground/45 pop" : "bg-field shadow-recessed ring-hairline-strong", shake && "shake")}
          aria-hidden="true">{current[i] ? display(current[i]) : ""}</span
        >
      {/each}
    </div>
  {/if}
  {#each { length: blanks * length }, i (i)}
    <span class="tile bg-field shadow-recessed ring-1 ring-hairline ring-inset" aria-hidden="true"></span>
  {/each}
</div>

<style>
  .tile {
    display: grid;
    place-items: center;
    width: var(--tile);
    height: var(--tile);
    border-radius: calc(var(--tile) * 0.12);
    font-size: calc(var(--tile) * 0.5);
    font-weight: 700;
    line-height: 1;
    text-transform: uppercase;
  }

  .reveal {
    animation:
      flip 480ms var(--ease-out) backwards,
      unfilled 240ms steps(1, end) backwards;
    animation-delay: var(--delay);
  }

  .pop {
    animation: pop 100ms var(--ease-out);
  }

  @keyframes flip {
    0% {
      transform: rotateX(0);
    }
    50% {
      transform: rotateX(90deg);
    }
    100% {
      transform: rotateX(0);
    }
  }

  @keyframes unfilled {
    from {
      background-color: transparent;
      color: var(--foreground);
      box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 45%, transparent);
    }
  }

  @keyframes pop {
    50% {
      scale: 1.08;
    }
  }

  .shake {
    animation: shake 400ms linear;
  }

  @keyframes shake {
    20%,
    60% {
      translate: -4px;
    }
    40%,
    80% {
      translate: 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reveal,
    .pop,
    .shake {
      animation: none;
    }
  }
</style>
