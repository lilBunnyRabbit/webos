<script lang="ts">
  import kernel, {
    format_keys,
    ShortcutCategory,
    type DialogProps,
    type KeyShortcut,
    type ShortcutsService,
    type WindowsService,
  } from "$lib/core/api";
  import { Keyboard as KeyboardIcon, X as XIcon } from "phosphor-svelte";
  import { IconButton, Kbd } from "../ui";

  let { resolve }: DialogProps<never> = $props();

  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const windows = $derived(kernel.service<WindowsService>("windows"));
  const focused = $derived(windows.get_focused());

  const GROUPS: Array<{ category: ShortcutCategory; title: string }> = [
    { category: ShortcutCategory.APP, title: "This app" },
    { category: ShortcutCategory.WINDOW, title: "Windows" },
    { category: ShortcutCategory.APPS, title: "Apps" },
    { category: ShortcutCategory.SYSTEM, title: "System" },
  ];

  // Window shortcuts of other windows don't apply right now, so they aren't listed.
  const live = $derived(shortcuts.list().filter((shortcut) => !shortcut.window || shortcut.window === focused));
  const grouped = $derived(
    GROUPS.map((group) => ({ ...group, items: live.filter((shortcut: KeyShortcut) => shortcut.category === group.category) })).filter(
      (group) => group.items.length > 0
    )
  );
</script>

<div class="flex max-h-[min(36rem,calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-[min(28rem,calc(100vw-2rem))] flex-col rounded-2xl bg-background-lighter shadow-popover animate-pop-in">
  <header class="flex items-center gap-3 px-5 pt-4 pb-3">
    <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary"><KeyboardIcon class="size-5" weight="bold" /></span>
    <h2 class="flex-1 text-sm font-semibold">Keyboard shortcuts</h2>
    <IconButton label="Close" size="sm" onclick={() => resolve(null)}><XIcon weight="bold" /></IconButton>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
    {#each grouped as group (group.category)}
      <section class="pt-2">
        <h3 class="px-2 pb-1 text-2xs font-medium tracking-wide text-foreground/80 uppercase">{group.title}</h3>
        <ul>
          {#each group.items as shortcut (shortcut)}
            <li class="flex h-9 items-center justify-between gap-4 rounded-lg px-2 text-ui">
              <span class="truncate">{shortcut.label}</span>
              <span class="flex shrink-0 gap-1">
                {#each format_keys(shortcut.keys, shortcuts.mac) as part, index (index)}<Kbd>{part}</Kbd>{/each}
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>
