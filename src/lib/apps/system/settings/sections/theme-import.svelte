<script lang="ts">
  import kernel, { NotificationType, ThemeGroup, with_saved, type FilesService, type NotificationsService, type SavedTheme, type SettingsService } from "$lib/core/api";
  import { Button, Section } from "$lib/core/components/ui";
  import ThemeCard from "$lib/core/components/theme/theme-card.svelte";
  import { error_message } from "$lib/core/utils";
  import { free_theme_name, parse_theme_file } from "../theme-file";

  let { path, onclose }: { path: string; onclose: () => void } = $props();

  const settings = $derived(kernel.service<SettingsService>("settings"));
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let loaded = $state<SavedTheme | null>(null);
  const name = $derived(loaded ? free_theme_name(settings.saved_themes, loaded.name) : "");

  function reject(message: string) {
    notifications.notify("settings", { type: NotificationType.ERROR, title: "Couldn't import the theme", message });
    onclose();
  }

  $effect(() => {
    const at = path;
    let stale = false;
    loaded = null;
    files
      .get_file(at)
      .then(async (file) => {
        if (stale) return;
        if (!file) return reject(`${at} doesn't exist.`);
        const result = parse_theme_file(await file.text(), (value) => CSS.supports("color", value));
        if (stale) return;
        if (result.ok) loaded = result.theme;
        else reject(result.error);
      })
      .catch((error) => !stale && reject(error_message(error)));
    return () => {
      stale = true;
    };
  });

  function import_theme() {
    if (!loaded) return;
    settings.saved_themes = with_saved(settings.saved_themes, name, loaded.theme);
    settings.theme = { ...loaded.theme };
    onclose();
  }
</script>

{#if loaded}
  <Section title="Import theme" description={name === loaded.name ? path : `${path} · saved as “${name}”, since “${loaded.name}” is taken`} flush>
    <div class="flex flex-wrap items-end gap-3 rounded-xl bg-background-light p-3 ring-1 ring-foreground/8">
      <div class="grid w-40">
        <ThemeCard preset={{ name, theme: loaded.theme, group: ThemeGroup.WEBOS }} active={false} onselect={import_theme} />
      </div>
      <div class="ml-auto flex gap-2">
        <Button variant="quiet" onclick={onclose}>Cancel</Button>
        <Button variant="primary" onclick={import_theme}>Import</Button>
      </div>
    </div>
  </Section>
{/if}
