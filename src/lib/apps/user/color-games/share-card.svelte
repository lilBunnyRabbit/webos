<script lang="ts">
  import kernel, { NotificationType, type ClipboardService, type NotificationsService } from "$lib/core/api";
  import { Button } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { error_message } from "$lib/core/utils";
  import { Check as CheckIcon, ShareNetwork as ShareNetworkIcon } from "phosphor-svelte";
  import type { NextAction } from "./run";

  let { text, next }: { text: string; next: NextAction } = $props();

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
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't copy the result", message: error_message(reason) });
      return;
    }
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="flex w-full max-w-md flex-col gap-3">
  <pre class="overflow-x-auto rounded-lg bg-background-darker px-3 py-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-foreground/80 ring-1 ring-foreground/8 [overflow-wrap:anywhere]">{text}</pre>
  <div class="flex flex-wrap justify-end gap-2">
    <Button onclick={next.run}>{next.label}</Button>
    <Button variant="primary" onclick={copy}>
      {#if copied}<CheckIcon weight="bold" />Copied{:else}<ShareNetworkIcon weight="bold" />Copy result{/if}
    </Button>
  </div>
</div>
