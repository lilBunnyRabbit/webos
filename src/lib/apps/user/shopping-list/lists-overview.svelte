<script lang="ts">
  import { IconButton } from "$lib/core/components/ui";
  import { GearSix as GearSixIcon, Plus as PlusIcon, Stack as StackIcon } from "phosphor-svelte";
  import type { List } from "./data";
  import { left_count } from "./items";
  import ListMark from "./list-mark.svelte";
  import { live } from "./merge";

  interface Props {
    lists: List[];
    onopen: (id: string | null) => void;
    onsettings: (id: string) => void;
    onnew: () => void;
  }

  let { lists, onopen, onsettings, onnew }: Props = $props();

  const total = $derived(lists.reduce((sum, list) => sum + left_count(list), 0));
  const PREVIEW = 4;

  function preview(list: List) {
    const open = live(list.items).filter((item) => !item.checked);
    const shown = open.slice(0, PREVIEW).map((item) => item.text);
    return open.length > PREVIEW ? `${shown.join(" · ")} +${open.length - PREVIEW}` : shown.join(" · ");
  }
</script>

<div class="mx-auto flex max-w-xl flex-col gap-3 p-3">
  <button
    type="button"
    class="flex min-h-14 items-center gap-3 rounded-xl bg-background-light px-3 text-left shadow-card ring-1 ring-hairline hover:bg-background-lighter"
    onclick={() => onopen(null)}
  >
    <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-raised shadow-raised"><StackIcon weight="bold" class="size-6" /></span>
    <span class="min-w-0 flex-1 font-medium">All lists</span>
    <span class="font-mono text-sm text-foreground/65 tabular-nums">{total} left</span>
  </button>

  <ul class="grid gap-3 @lg:grid-cols-2" aria-label="Lists">
    {#each lists as list (list.id)}
      {@const left = left_count(list)}
      {@const items = preview(list)}
      <li class="flex items-stretch overflow-hidden rounded-xl bg-background-light shadow-card ring-1 ring-hairline">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-[background-color,box-shadow,color] hover:bg-background-lighter" onclick={() => onopen(list.id)}>
          <ListMark {list} size="lg" />
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-baseline gap-2">
              <span class="min-w-0 flex-1 truncate font-semibold">{list.name}</span>
              <span class="shrink-0 font-mono text-sm text-foreground/65 tabular-nums">{left ? `${left} left` : "Done"}</span>
            </span>
            <span class="truncate text-sm text-foreground/65">{items || "Nothing on it"}</span>
          </span>
        </button>
        <IconButton label="Settings for “{list.name}”" class="m-1.5 shrink-0 self-center text-foreground/65" onclick={() => onsettings(list.id)}>
          <GearSixIcon weight="bold" />
        </IconButton>
      </li>
    {/each}
  </ul>

  <button
    type="button"
    class="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-hairline-strong text-sm font-medium text-foreground/80 transition-[background-color,box-shadow,color] hover:bg-background-lighter hover:text-foreground hover:shadow-control active:shadow-pressed"
    onclick={onnew}
  >
    <PlusIcon weight="bold" /> New list
  </button>
</div>
