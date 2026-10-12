<script lang="ts">
  import kernel, { NotificationType, type ClipboardService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { IconButton } from "$lib/core/components/ui";
  import { Check as CheckIcon, Copy as CopyIcon } from "phosphor-svelte";

  let { text, label = "Copy", disabled = false }: { text: string; label?: string; disabled?: boolean } = $props();

  const { app_id } = get_app_context();
  const clipboard = $derived(kernel.service<ClipboardService>("clipboard"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(timer));

  async function copy() {
    try {
      await clipboard.copy_text(text);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't copy to the clipboard", message });
      return;
    }
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1200);
  }
</script>

<IconButton label={copied ? "Copied" : label} size="sm" {disabled} onclick={copy}>
  {#if copied}<CheckIcon weight="bold" class="text-success" />{:else}<CopyIcon />{/if}
</IconButton>
