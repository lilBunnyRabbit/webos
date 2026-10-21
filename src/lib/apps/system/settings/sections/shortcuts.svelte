<script lang="ts">
  import kernel, { format_keys, ShortcutCategory, type ShellService, type ShortcutsService } from "$lib/core/api";
  import { Button, Kbd, Section, SettingRow } from "$lib/core/components/ui";

  const shortcuts = $derived(kernel.service<ShortcutsService>("shortcuts"));
  const shell = $derived(kernel.service<ShellService>("shell"));

  const GROUPS = [
    { category: ShortcutCategory.WINDOW, setting: "shortcuts-windows", title: "Windows", description: "Act on the focused window." },
    { category: ShortcutCategory.APPS, setting: "shortcuts-apps", title: "Apps", description: "Open apps, search and the Terminal." },
    { category: ShortcutCategory.SYSTEM, setting: "shortcuts-system", title: "System", description: "The desktop and WebOS itself." },
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
    <Section setting={group.setting} title={group.title} description={group.description}>
      {#each group.items as shortcut (shortcut.id)}
        <SettingRow label={shortcut.label}>
          {#snippet children()}
            <span class="flex gap-1">
              {#each format_keys(shortcut.keys, shortcuts.mac) as part, index (index)}<Kbd>{part}</Kbd>{/each}
            </span>
          {/snippet}
        </SettingRow>
      {/each}
    </Section>
  {/each}

  <div>
    <Button variant="secondary" size="sm" onclick={() => void shell.execute("shortcuts sheet")}>Open the shortcuts sheet</Button>
  </div>
</div>
