<script lang="ts">
  import kernel, { format_keys, ShortcutCategory, type ShellService, type ShortcutsService } from "$lib/core/api";
  import { Button, Kbd, Section } from "$lib/core/components/ui";

  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const shell = $derived(kernel.service<ShellService>("shell"));

  const GROUPS = [
    { category: ShortcutCategory.WINDOW, title: "Windows", description: "Act on the focused window." },
    { category: ShortcutCategory.APPS, title: "Apps", description: "Open apps, search and the Terminal." },
    { category: ShortcutCategory.SYSTEM, title: "System", description: "The desktop and WebOS itself." },
  ];

  // Window-scoped shortcuts belong to whichever app is focused, so this page lists only the OS set.
  const global = $derived(shortcuts.list().filter((shortcut) => !shortcut.window));
  const grouped = $derived(
    GROUPS.map((group) => ({ ...group, items: global.filter((shortcut) => shortcut.category === group.category) })).filter(
      (group) => group.items.length > 0
    )
  );
  const sheet = $derived(format_keys("mod+/", shortcuts.mac));
</script>

<div class="flex flex-col gap-8">
  <p class="text-ui text-foreground/65">
    Apps add their own shortcuts while their window is focused. Press
    {#each sheet as part, index (index)}<Kbd>{part}</Kbd>{/each}
    anywhere to see the ones that apply right now.
  </p>

  {#each grouped as group (group.category)}
    <Section title={group.title} description={group.description}>
      {#each group.items as shortcut (shortcut.id)}
        <div class="flex min-h-11 items-center justify-between gap-4 px-4 py-2 text-ui">
          <span class="min-w-0 truncate">{shortcut.label}</span>
          <span class="flex shrink-0 gap-1">
            {#each format_keys(shortcut.keys, shortcuts.mac) as part, index (index)}<Kbd>{part}</Kbd>{/each}
          </span>
        </div>
      {/each}
    </Section>
  {/each}

  <div>
    <Button variant="secondary" size="sm" onclick={() => void shell.execute("shortcuts sheet")}>Open the shortcuts sheet</Button>
  </div>
</div>
