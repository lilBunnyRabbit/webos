<script lang="ts">
  import { cn } from "$lib/core/utils";

  let { ctrl, onkey, oninsert, onctrl }: { ctrl: boolean; onkey: (key: string) => void; oninsert: (text: string) => void; onctrl: () => void } = $props();

  const KEYS: { label: string; key?: string; text?: string }[] = [
    { label: "Tab", key: "Tab" },
    { label: "Esc", key: "Escape" },
    { label: "←", key: "ArrowLeft" },
    { label: "↑", key: "ArrowUp" },
    { label: "↓", key: "ArrowDown" },
    { label: "→", key: "ArrowRight" },
    { label: "|", text: " | " },
    { label: "~", text: "~" },
    { label: "/", text: "/" },
  ];

  const key_class = "h-9 min-w-10 shrink-0 rounded-md bg-foreground/6 px-2.5 font-mono text-ui text-foreground/80 active:bg-foreground/12";
</script>

<!-- Buttons keep the field focused, so the soft keyboard stays open. -->
<div class="hidden shrink-0 gap-1.5 overflow-x-auto border-t border-foreground/8 bg-background-light px-2 py-1.5 pointer-coarse:flex" role="toolbar" aria-label="Terminal keys">
  <button type="button" class={cn(key_class, ctrl && "bg-primary/20 text-primary")} aria-pressed={ctrl} onpointerdown={(event) => event.preventDefault()} onclick={onctrl}>Ctrl</button>
  {#each KEYS as item (item.label)}
    <button
      type="button"
      class={key_class}
      onpointerdown={(event) => event.preventDefault()}
      onclick={() => (item.key ? onkey(item.key) : oninsert(item.text!))}
    >
      {item.label}
    </button>
  {/each}
</div>
