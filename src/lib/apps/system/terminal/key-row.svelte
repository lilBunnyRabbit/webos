<script lang="ts">
  import { button } from "$lib/core/components/ui";

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

  const key_class = (pressed = false) => button({ pressed, class: ["h-9 min-w-10 px-2.5 font-mono text-ui pointer-coarse:h-9", !pressed && "text-foreground/80"] });
</script>

<!-- Buttons keep the field focused, so the soft keyboard stays open. -->
<div class="hidden shrink-0 gap-1.5 overflow-x-auto border-t border-hairline bg-background-light px-2 py-1.5 pointer-coarse:flex" role="toolbar" aria-label="Terminal keys">
  <button type="button" class={key_class(ctrl)} aria-pressed={ctrl} onpointerdown={(event) => event.preventDefault()} onclick={onctrl}>Ctrl</button>
  {#each KEYS as item (item.label)}
    <button
      type="button"
      class={key_class()}
      onpointerdown={(event) => event.preventDefault()}
      onclick={() => (item.key ? onkey(item.key) : oninsert(item.text!))}
    >
      {item.label}
    </button>
  {/each}
</div>
