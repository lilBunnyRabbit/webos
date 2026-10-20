<script lang="ts">
  import { Button, Checkbox } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { untrack } from "svelte";
  import { COLOR_NAME, ICON_NAME } from "./colors";
  import { ListIcon } from "./data";
  import ListMark from "./list-mark.svelte";
  import { ChangeKind, describe_item, type Change, type ListReview } from "./share";

  interface Props {
    reviews: ListReview[];
    onapply: (picked: Set<string>) => void;
    oncancel: () => void;
  }

  let { reviews, onapply, oncancel }: Props = $props();

  const all = $derived(reviews.flatMap((review) => review.changes));
  let picked = $state(new Set(untrack(() => reviews.flatMap((review) => review.changes.map((change) => change.id)))));
  const count = $derived(all.filter((change) => picked.has(change.id)).length);

  const GROUPS: { kinds: ChangeKind[]; title: string }[] = [
    { kinds: [ChangeKind.NEW_LIST], title: "New list" },
    { kinds: [ChangeKind.DETAILS], title: "List details" },
    { kinds: [ChangeKind.ADD], title: "New" },
    { kinds: [ChangeKind.EDIT], title: "Changed" },
    { kinds: [ChangeKind.TICK, ChangeKind.UNTICK], title: "Ticked and unticked" },
    { kinds: [ChangeKind.DELETE], title: "Deleted" },
  ];

  function toggle(id: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    picked = next;
  }

  function details(change: Extract<Change, { kind: typeof ChangeKind.DETAILS }>) {
    const parts: string[] = [];
    if (change.from.name !== change.to.name) parts.push(`name ${change.from.name} → ${change.to.name}`);
    if (change.from.color !== change.to.color) parts.push(`colour ${COLOR_NAME[change.from.color]} → ${COLOR_NAME[change.to.color]}`);
    if (change.to.icon && change.from.icon !== change.to.icon) parts.push(`icon ${ICON_NAME[change.from.icon ?? ListIcon.CART]} → ${ICON_NAME[change.to.icon]}`);
    return parts.join(" · ");
  }
</script>

<section aria-label="Changes from the other phone" class="mx-auto flex h-full w-full max-w-md flex-col">
  {#if all.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <p class="text-sm font-medium">Already up to date</p>
      <p class="text-ui text-foreground/65">This phone has everything those codes carry.</p>
      <Button variant="primary" onclick={oncancel}>Back to the list</Button>
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
      {#each reviews as review (review.list_id)}
        {#if review.changes.length > 0}
          <div class="flex flex-col gap-2">
            <p class="text-sm font-semibold">From “{review.name}” · {review.changes.length} {review.changes.length === 1 ? "change" : "changes"}</p>
            {#each GROUPS as group (group.title)}
              {@const changes = review.changes.filter((change) => group.kinds.includes(change.kind))}
              {#if changes.length > 0}
                <div class="flex flex-col">
                  <p class="px-1 pb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">{group.title} · {changes.length}</p>
                  {#each changes as change (change.id)}
                    <label class="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-foreground/4">
                      <Checkbox checked={picked.has(change.id)} onchange={(event) => toggle(change.id, event.currentTarget.checked)} class="size-5" />
                      {#if change.kind === ChangeKind.NEW_LIST}
                        <ListMark list={change.list} size="sm" />
                        <span class="min-w-0 flex-1">{change.list.name} <span class="text-foreground/65">· {change.count} {change.count === 1 ? "item" : "items"}</span></span>
                      {:else if change.kind === ChangeKind.DETAILS}
                        <ListMark list={change.to} size="sm" />
                        <span class="min-w-0 flex-1 text-ui">{details(change)}</span>
                      {:else if change.kind === ChangeKind.EDIT}
                        <span class="min-w-0 flex-1">
                          <span class="text-foreground/55 line-through">{describe_item(change.before)}</span> → <span class="font-medium">{describe_item(change.item)}</span>
                        </span>
                      {:else}
                        <span class={cn("min-w-0 flex-1", change.kind === ChangeKind.DELETE && "line-through decoration-error", change.kind !== ChangeKind.DELETE && "font-medium")}>
                          {describe_item(change.item)}
                        </span>
                      {/if}
                    </label>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      {/each}
    </div>
    <div class="flex items-center justify-end gap-2 border-t border-foreground/8 bg-background-light px-4 py-3">
      <Button variant="quiet" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" disabled={count === 0} onclick={() => onapply(picked)}>Apply {count}</Button>
    </div>
  {/if}
</section>
