<script lang="ts">
  import { Button, Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { untrack } from "svelte";
  import { COLOR_DOT, COLOR_TILE, color_names, ICON, ICON_NAME } from "./colors";
  import { LIST_COLORS, LIST_ICONS, ListIcon, type ListColor, type ListMeta } from "./data";
  import ListMark from "./list-mark.svelte";

  type Details = Pick<ListMeta, "name" | "color" | "icon">;

  interface Props {
    list: Details;
    title: string;
    confirm_label: string;
    onsave: (details: Details) => void;
    oncancel: () => void;
  }

  let { list, title, confirm_label, onsave, oncancel }: Props = $props();

  const id = $props.id();
  let name = $state(untrack(() => list.name));
  let color = $state<ListColor>(untrack(() => list.color));
  let icon = $state<ListIcon>(untrack(() => list.icon ?? ListIcon.CART));
  const can_save = $derived(name.trim().length > 0);
  const names = color_names();

  function save(event: SubmitEvent) {
    event.preventDefault();
    if (can_save) onsave({ name: name.trim(), color, icon });
  }
</script>

<form aria-label={title} class="mx-auto flex h-full w-full max-w-md flex-col" onsubmit={save}>
  <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
    <div class="flex items-center gap-3">
      <ListMark list={{ color, icon }} size="lg" />
      <p class="min-w-0 flex-1 truncate text-lg font-semibold">{name.trim() || title}</p>
    </div>

    <label class="flex flex-col gap-1.5">
      <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Name</span>
      <Input bind:value={name} size="lg" autocomplete="off" placeholder="Pharmacy, Hardware store…" />
    </label>

    <div class="flex flex-col gap-1.5">
      <span id="{id}-color" class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Colour</span>
      <div role="radiogroup" aria-labelledby="{id}-color" class="flex flex-wrap gap-2">
        {#each LIST_COLORS as option (option)}
          <button
            type="button"
            role="radio"
            aria-checked={color === option}
            aria-label={names[option]}
            title={names[option]}
            class={cn("grid size-10 place-items-center rounded-full ring-2 transition-shadow ring-inset", color === option ? "ring-foreground" : "ring-transparent hover:ring-foreground/20")}
            onclick={() => (color = option)}
          >
            <span class={cn("size-7 rounded-full", COLOR_DOT[option])}></span>
          </button>
        {/each}
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <span id="{id}-icon" class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Icon</span>
      <div role="radiogroup" aria-labelledby="{id}-icon" class="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
        {#each LIST_ICONS as option (option)}
          {@const Icon = ICON[option]}
          <button
            type="button"
            role="radio"
            aria-checked={icon === option}
            aria-label={ICON_NAME[option]}
            title={ICON_NAME[option]}
            class={cn(
              "grid aspect-square place-items-center rounded-xl ring-1 transition-colors ring-inset",
              icon === option ? cn(COLOR_TILE[color], "ring-2 ring-current") : "text-foreground ring-foreground/15 hover:bg-foreground/6"
            )}
            onclick={() => (icon = option)}
          >
            <Icon weight={icon === option ? "fill" : "regular"} class="size-5" />
          </button>
        {/each}
      </div>
    </div>
  </div>
  <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 py-3">
    <Button variant="quiet" onclick={oncancel}>Cancel</Button>
    <Button type="submit" variant="primary" disabled={!can_save}>{confirm_label}</Button>
  </div>
</form>
