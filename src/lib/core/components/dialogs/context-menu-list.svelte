<script lang="ts">
  import type { MenuItem } from "$lib/core/api";
  import { cn } from "$lib/core/utils";
  import { CaretRight as CaretRightIcon } from "phosphor-svelte";
  import type { Attachment } from "svelte/attachments";
  import Self from "./context-menu-list.svelte";

  let {
    items,
    onselect,
    onback,
    sheet = false,
    class: class_name,
  }: {
    items: MenuItem[];
    onselect: (id: string) => void;
    /** Present on submenus: close this level and return focus to the parent item. */
    onback?: () => void;
    /** A bottom sheet on phones: full width, submenus open inline below their item, no shortcut hints. */
    sheet?: boolean;
    class?: string;
  } = $props();

  const uid = $props.id();
  // showModal() focuses the dialog's first focusable element (the menu itself, tabindex -1) unless an item says autofocus.
  const first_enabled = $derived(items.findIndex((item) => !("separator" in item) && !("disabled" in item && item.disabled)));
  let open_index = $state<number | null>(null);
  let panel: HTMLElement | null = $state(null);

  function enabled_buttons(): HTMLElement[] {
    return [...(panel?.querySelectorAll<HTMLElement>(":scope > [role=menuitem]:not(:disabled)") ?? [])];
  }

  function move(delta: number) {
    const buttons = enabled_buttons();
    // The panel's own document: a popped-out window's menu lives in its mini window (ADR-043).
    const index = buttons.indexOf(panel?.ownerDocument.activeElement as HTMLElement);
    buttons.at((index + delta + buttons.length) % buttons.length)?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    // Keys belong to the deepest open level; a parent ignores what bubbles up from its submenu.
    if ((event.target as HTMLElement).closest("[role=menu]") !== panel) return;

    const key = event.key;
    if (key === "ArrowDown") move(1);
    else if (key === "ArrowUp") move(-1);
    else if (key === "Home") enabled_buttons()[0]?.focus();
    else if (key === "End") enabled_buttons().at(-1)?.focus();
    else if (key === "ArrowLeft" && onback) onback();
    else if (key.length === 1 && /\S/.test(key)) {
      // Typeahead: the next item starting with that letter.
      const buttons = enabled_buttons();
      const start = buttons.indexOf(panel?.ownerDocument.activeElement as HTMLElement);
      const next = [...buttons.slice(start + 1), ...buttons.slice(0, start + 1)].find((button) =>
        button.dataset.label?.toLowerCase().startsWith(key.toLowerCase())
      );
      next?.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  // Uses the element it's attached to: `panel` from bind:this isn't set yet when attachments first run.
  const focus_first: Attachment<HTMLElement> = (element) => {
    element.querySelector<HTMLElement>(":scope > [role=menuitem]:not(:disabled)")?.focus();
  };
</script>

<div
  bind:this={panel}
  role="menu"
  tabindex="-1"
  class={cn(
    "flex flex-col gap-px bg-background-lighter text-ui outline-none",
    sheet ? "w-full rounded-t-2xl p-2 pt-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "min-w-52 max-w-72 rounded-xl p-1.5 shadow-popover",
    class_name
  )}
  {onkeydown}
  {@attach focus_first}
>
  {#each items as item, index (index)}
    {#if "separator" in item}
      <div role="separator" class="mx-2 my-1 h-px bg-foreground/10"></div>
    {:else if "items" in item}
      {@const open = open_index === index}
      <!-- svelte-ignore a11y_autofocus -->
      <button
        role="menuitem"
        autofocus={index === first_enabled}
        aria-haspopup="menu"
        aria-expanded={open}
        data-label={item.label}
        class={cn(
          "flex h-8 pointer-coarse:h-11 items-center gap-2.5 rounded-lg px-2 text-left transition-[background-color,box-shadow] outline-none hover:bg-background-lighter hover:shadow-control focus:bg-background-lighter focus:shadow-control",
          open && "bg-background-lighter shadow-control"
        )}
        style:anchor-name="--submenu-{uid}-{index}"
        onpointerenter={() => !sheet && (open_index = index)}
        onclick={() => (open_index = sheet && open ? null : index)}
        onkeydown={(event) => {
          if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            open_index = index;
          }
        }}
      >
        {#if item.icon}<item.icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />{:else}<span class="size-4 shrink-0"></span>{/if}
        <span class="flex-1 truncate">{item.label}</span>
        <CaretRightIcon class={cn("size-3 text-foreground/65 transition-transform", sheet && open && "rotate-90")} weight="bold" />
      </button>
      {#if open && sheet}
        <Self items={item.items} {onselect} sheet class="rounded-none p-0 pb-0 pl-6" />
      {:else if open}
        <div class="submenu" style:position-anchor="--submenu-{uid}-{index}">
          <Self
            items={item.items}
            {onselect}
            onback={() => {
              open_index = null;
              enabled_buttons()[enabled_buttons().findIndex((button) => button.dataset.label === item.label)]?.focus();
            }}
          />
        </div>
      {/if}
    {:else}
      <!-- svelte-ignore a11y_autofocus -->
      <button
        role="menuitem"
        autofocus={index === first_enabled}
        disabled={item.disabled}
        data-label={item.label}
        class={cn(
          "flex h-8 pointer-coarse:h-11 items-center gap-2.5 rounded-lg px-2 text-left transition-colors outline-none disabled:opacity-38",
          item.danger ? "text-error hover:bg-error/12 focus:bg-error/12" : "hover:bg-background-lighter hover:shadow-control focus:bg-background-lighter focus:shadow-control"
        )}
        onpointerenter={() => (open_index = null)}
        onclick={() => onselect(item.id)}
      >
        {#if item.icon}
          <item.icon class={cn("size-4 shrink-0", item.danger ? "text-error" : "text-foreground/80")} weight="duotone" />
        {:else}
          <span class="size-4 shrink-0"></span>
        {/if}
        <span class="flex-1 truncate">{item.label}</span>
        {#if item.shortcut && !sheet}<span class="font-mono text-2xs text-foreground/65">{item.shortcut}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  /* Submenus position against their parent item; fixed so the panel can leave the menu's box. */
  .submenu {
    position: fixed;
    position-area: right span-bottom;
    position-try-fallbacks: flip-inline;
    margin-inline: 4px;
    margin-block-start: -6px;
    z-index: 1;
  }
</style>
