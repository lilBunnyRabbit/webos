<script lang="ts">
  import { cn } from "$lib/core/utils";
  import { Backspace as BackspaceIcon, KeyReturn as KeyReturnIcon } from "phosphor-svelte";
  import { Mark } from "./feedback";
  import { display } from "./tiles";

  interface KeyBoard {
    marks: ReadonlyMap<string, Mark>;
    solved: boolean;
  }

  interface Props {
    rows: readonly string[];
    boards: readonly KeyBoard[];
    disabled?: boolean;
    onkey: (key: string) => void;
  }

  const { rows, boards, disabled = false, onkey }: Props = $props();

  const FILL: Record<Mark, string> = {
    correct: "bg-success",
    present: "bg-warning",
    absent: "bg-background",
  };

  const single = $derived(boards.length === 1);

  function key_class(key: string): string {
    const open = boards.filter((board) => !board.solved);
    const marks = (open.length ? open : boards).map((board) => board.marks.get(key));
    if (single && (marks[0] === Mark.CORRECT || marks[0] === Mark.PRESENT)) return cn(FILL[marks[0]], "text-background shadow-control");
    if (marks.length && marks.every((mark) => mark === Mark.ABSENT)) return "bg-foreground/4 text-foreground/40";
    return "bg-raised text-foreground shadow-control ring-1 ring-hairline hover:bg-raised-hover";
  }

  function key_label(key: string): string {
    if (key === "enter") return "Enter";
    if (key === "backspace") return "Backspace";
    const marks = boards.map((board) => board.marks.get(key)).filter((mark) => mark !== undefined);
    const best = marks.includes(Mark.CORRECT) ? "correct" : marks.includes(Mark.PRESENT) ? "in the word" : marks.length ? "not in the word" : "";
    return best ? `${display(key)}, ${best}` : display(key);
  }

  // Keys never take focus, so Enter typed after a click still submits instead of pressing the last key again.
  function keep_focus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

<div class="flex w-full max-w-[34rem] flex-col items-center gap-1.5 select-none" role="group" aria-label="Keyboard">
  {#each rows as row (row)}
    <div class="flex w-full justify-center gap-1.5">
      {#each row.split(" ") as key (key)}
        {@const wide = key === "enter" || key === "backspace"}
        <button
          type="button"
          tabindex="-1"
          {disabled}
          aria-label={key_label(key)}
          class={cn(
            "relative grid h-11 min-w-0 place-items-center overflow-hidden rounded-md text-sm font-semibold uppercase transition-colors duration-150",
            "hover:opacity-85 active:translate-y-px active:shadow-pressed disabled:opacity-38 disabled:shadow-none",
            wide ? "flex-[1.5] px-1" : "flex-1",
            key_class(key)
          )}
          onpointerdown={keep_focus}
          onclick={() => onkey(key)}
        >
          {#if !single && !wide}
            <span
              class="pointer-events-none absolute inset-x-1 bottom-1 grid h-2 gap-px"
              style:grid-template-columns="repeat({boards.length}, 1fr)"
              aria-hidden="true"
            >
              {#each boards as board, index (index)}
                {@const mark = board.solved ? undefined : board.marks.get(key)}
                <span class={cn("rounded-[1px]", mark ? FILL[mark] : !board.solved && "bg-foreground/12")}></span>
              {/each}
            </span>
          {/if}
          <span class="relative">
            {#if key === "enter"}
              <KeyReturnIcon class="size-4" weight="bold" />
            {:else if key === "backspace"}
              <BackspaceIcon class="size-4" weight="bold" />
            {:else}
              {display(key)}
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {/each}
</div>
