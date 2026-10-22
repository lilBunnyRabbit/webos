<script lang="ts">
  import { Grabber } from "$lib/core/components/ui";
  import { swipe_dismiss } from "$lib/core/utils/swipe-dismiss";
  import { cn } from "$lib/core/utils";
  import {
    CheckSquare as CheckSquareIcon,
    Image as ImageIcon,
    ListBullets as ListBulletsIcon,
    ListNumbers as ListNumbersIcon,
    Minus as MinusIcon,
    Quotes as QuotesIcon,
    Scissors as ScissorsIcon,
    Stack as StackIcon,
    Table as TableIcon,
    TextH as TextHIcon,
    TextHOne as TextHOneIcon,
    TextHThree as TextHThreeIcon,
    TextHTwo as TextHTwoIcon,
    TextT as TextTIcon,
  } from "phosphor-svelte";
  import type { Component } from "svelte";
  import type { WarrenEditor } from "./editor.svelte";
  import { SlashCommand } from "./slash";

  interface Props {
    editor: WarrenEditor;
    sheet: boolean;
    anchor: string;
  }

  let { editor, sheet, anchor }: Props = $props();

  const ICONS: Record<SlashCommand, Component<{ class?: string; weight?: "duotone" }>> = {
    [SlashCommand.TEXT]: TextTIcon,
    [SlashCommand.TITLE]: TextHIcon,
    [SlashCommand.H1]: TextHOneIcon,
    [SlashCommand.H2]: TextHTwoIcon,
    [SlashCommand.H3]: TextHThreeIcon,
    [SlashCommand.BULLETS]: ListBulletsIcon,
    [SlashCommand.NUMBERS]: ListNumbersIcon,
    [SlashCommand.CHECKLIST]: CheckSquareIcon,
    [SlashCommand.QUOTE]: QuotesIcon,
    [SlashCommand.RULE]: MinusIcon,
    [SlashCommand.TABLE]: TableIcon,
    [SlashCommand.PICTURE]: ImageIcon,
    [SlashCommand.PAGE_BREAK]: ScissorsIcon,
    [SlashCommand.TEMPLATE]: StackIcon,
  };

  const id = $props.id();
  const open = $derived(editor.slash !== null);
  let popover = $state<HTMLElement>();
  let list = $state<HTMLElement>();

  $effect(() => {
    if (sheet || !popover) return;
    if (open && !popover.matches(":popover-open")) popover.showPopover();
    else if (!open && popover.matches(":popover-open")) popover.hidePopover();
  });

  $effect(() => {
    void editor.slash_index;
    list?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
  });

  // Typing goes on filtering, so the editor keeps focus (and a phone its keyboard).
  const keep_focus = (event: PointerEvent) => event.preventDefault();
</script>

{#snippet items()}
  <div bind:this={list} id="{id}-list" role="listbox" aria-label="Insert a block" class="flex flex-col gap-px">
    {#each editor.slash_items as item, index (item.id)}
      {@const Icon = ICONS[item.id]}
      <!-- Arrows, Enter and Esc reach the menu through the editor, which keeps focus. -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        role="option"
        tabindex="-1"
        aria-selected={index === editor.slash_index}
        class={cn(
          "flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-ui select-none pointer-coarse:h-11",
          index === editor.slash_index ? "bg-foreground/10" : "hover:bg-foreground/6"
        )}
        onpointerdown={keep_focus}
        onpointermove={() => (editor.slash_index = index)}
        onclick={() => editor.pick_slash(index)}
      >
        <Icon class="size-4 shrink-0 text-foreground/80" weight="duotone" />
        <span class="flex-1 truncate">{item.label}</span>
        <span class="truncate font-mono text-2xs text-foreground/65">{item.hint}</span>
      </div>
    {:else}
      <p class="px-2 py-1.5 text-2xs text-foreground/65">No block called “{editor.slash?.query}”. Esc keeps the text.</p>
    {/each}
  </div>
{/snippet}

{#if sheet}
  {#if open}
    <div
      class="absolute inset-x-0 bottom-0 z-20 mx-auto flex max-h-[45%] w-full max-w-lg flex-col rounded-t-2xl bg-background-light shadow-raised ring-1 ring-foreground/10 motion-safe:animate-sheet-in"
      role="dialog"
      aria-label="Insert a block"
      {@attach swipe_dismiss({ on_dismiss: () => editor.close_slash() })}
    >
      <Grabber class="mt-2 mb-1" />
      <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {@render items()}
      </div>
    </div>
  {/if}
{:else}
  <div bind:this={popover} popover="manual" class="slash m-0 overflow-y-auto rounded-xl bg-background-lighter p-1.5 text-foreground shadow-popover" style="position-anchor: {anchor}">
    {#if open}{@render items()}{/if}
  </div>
{/if}

<style>
  .slash {
    width: 16rem;
    max-height: min(20rem, 50vh);
    position-area: bottom span-right;
    position-try-fallbacks: flip-block, flip-inline;
    margin-block: 4px;
  }
</style>
