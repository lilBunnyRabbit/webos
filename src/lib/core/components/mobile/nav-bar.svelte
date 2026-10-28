<script lang="ts">
  import { CaretLeft as CaretLeftIcon, Cards as CardsIcon, House as HouseIcon, Question as QuestionIcon } from "phosphor-svelte";
  import { cn } from "$lib/core/utils";

  let {
    running,
    unread,
    switcher,
    guide,
    onback,
    onhome,
    onrecents,
    onguide,
  }: {
    running: number;
    unread: boolean;
    switcher: boolean;
    /** `null` with no app on screen: the button hides. */
    guide: boolean | null;
    onback: () => void;
    onhome: () => void;
    onrecents: () => void;
    onguide: () => void;
  } = $props();

  const button = "relative grid h-10 w-16 place-items-center rounded-xl text-foreground/80 transition-colors duration-150 active:bg-foreground/10";
</script>

<!-- Buttons, not gestures: every screen edge belongs to the device (ADR-016). -->
<nav
  aria-label="Navigation"
  class="relative flex shrink-0 items-center justify-center gap-6 border-t border-foreground/8 bg-background-light/90 px-4 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl select-none"
>
  <button class={button} aria-label="Back" onclick={onback}>
    <CaretLeftIcon class="size-5.5" weight="bold" />
  </button>
  <button class={button} aria-label="Home" onclick={onhome}>
    <HouseIcon class="size-5.5" weight="bold" />
  </button>
  <button class={cn(button, switcher && "bg-foreground/10 text-foreground")} aria-label={unread ? "Running apps, new notifications" : "Running apps"}
    aria-pressed={switcher} onclick={onrecents}>
    <CardsIcon class="size-5.5" weight={switcher ? "fill" : "bold"} />
    {#if running > 0}
      <span
        class="absolute top-1 right-3.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-background"
        aria-hidden="true">{running}</span
      >
    {/if}
    {#if unread}
      <span class="absolute top-1.5 left-4 size-2 rounded-full bg-primary ring-2 ring-background-light" aria-hidden="true"></span>
    {/if}
  </button>
  {#if guide !== null}
    <!-- Off to the side, so the three main buttons stay put whether an app is on screen or not. -->
    <button class={cn(button, "absolute right-2 w-11", guide && "bg-foreground/10 text-foreground")} aria-label="Guide" aria-pressed={guide} onclick={onguide}>
      <QuestionIcon class="size-5.5" weight={guide ? "fill" : "bold"} />
    </button>
  {/if}
</nav>
