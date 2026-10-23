<script lang="ts">
  import kernel, { type AppsService, type WidgetProps } from "$lib/core/api";
  import { IconButton, Input } from "$lib/core/components/ui";
  import { app_data_path, json_file } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { Camera as CameraIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { COLOR_DOT } from "./colors";
  import { APP_ID, empty_file, LISTS_FILE, ListsFileSchema } from "./data";
  import { add_entry, left_count } from "./items";
  import { parse_entry } from "./parse";

  let { props, size }: WidgetProps = $props();

  const apps = $derived(kernel.service<AppsService>("apps"));

  const file = json_file(app_data_path(APP_ID, LISTS_FILE), empty_file(), ListsFileSchema);
  $effect(() => () => file.release());

  const list = $derived(file.value.lists.find((candidate) => candidate.id === props.list) ?? file.value.lists[0]);
  const left = $derived(list ? left_count(list) : 0);
  const tall = $derived(size.h >= 2);

  let draft = $state("");
  const can_add = $derived(file.ready && parse_entry(draft).text.length > 0);

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!list || !can_add) return;
    if (add_entry(list, draft)) draft = "";
  }
</script>

{#if list}
  <div class={cn("flex h-full flex-col justify-center", tall ? "gap-2 p-3" : "gap-1 px-2 py-1.5")}>
    <button
      type="button"
      class={cn(
        "flex min-w-0 items-center gap-1.5 rounded-md px-1 text-left transition-[background-color,box-shadow,color] hover:bg-background-lighter hover:text-foreground hover:shadow-control active:shadow-pressed",
        tall ? "min-h-8 text-sm" : "min-h-6 text-ui pointer-coarse:min-h-8"
      )}
      aria-label="Open {list.name}, {left} left"
      onclick={() => apps.launch(APP_ID, { list: list.id })}
    >
      <span class={cn("size-2 shrink-0 rounded-full", COLOR_DOT[list.color])}></span>
      <span class="min-w-0 flex-1 truncate font-medium">{list.name}</span>
      <span class="shrink-0 font-mono text-2xs text-foreground/65 tabular-nums">{left} left</span>
    </button>
    <form class="flex items-center gap-1" onsubmit={add}>
      <IconButton label="Read a list from a photo" size={tall ? "md" : "sm"} onclick={() => apps.launch(APP_ID, { list: list.id, photo: true })}>
        <CameraIcon weight="bold" />
      </IconButton>
      <Input
        bind:value={draft}
        size={tall ? "md" : "sm"}
        class="flex-1"
        placeholder="Add, like 2x milk"
        aria-label="Add to {list.name}"
        enterkeyhint="done"
        autocomplete="off"
      />
      <IconButton type="submit" label="Add" variant="primary" size={tall ? "md" : "sm"} disabled={!can_add}>
        <PlusIcon weight="bold" />
      </IconButton>
    </form>
  </div>
{/if}
